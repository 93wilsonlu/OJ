import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, vi, describe, test, expect } from 'vitest';
import userEvent from '@testing-library/user-event';

import * as problemsApi from '../src/api/problems';
import * as useAuthModule from '../src/hooks/useAuth';
import ProblemDetailPage from '../src/pages/ProblemDetailPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as any),
    useNavigate: () => mockNavigate,
  };
});

const mockAuth = (role = 'candidate') => {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { user_id: 'user-1', name: 'User', email: 'user@example.com', role },
    accessToken: 'token',
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('token'),
  } as any);
};

const renderPage = (problemId = 'p1') => {
  return render(
    <MemoryRouter initialEntries={[`/problems/${problemId}`]}>
      <Routes>
        <Route path="/problems/:problemId" element={<ProblemDetailPage />} />
        <Route path="/problems" element={<div>Problems List</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProblemDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth();
    vi.spyOn(problemsApi, 'apiGetProblem').mockResolvedValue({
      problem_id: 'p1',
      title: 'Array Sum',
      description: 'Find the sum of all elements',
      input_format: 'Array of integers',
      output_format: 'Single integer',
      sample_input: '1 2 3',
      sample_output: '6',
      difficulty: 'easy',
      time_limit: 1000,
      memory_limit: 256,
      allowed_langs: ['python3', 'cpp17'],
      created_by: null,
      created_at: '2026-05-31T00:00:00Z',
    } as any);
    vi.spyOn(problemsApi, 'apiListTestCases').mockResolvedValue([]);
  });

  test('loads and renders problem title', async () => {
    renderPage('p1');
    await waitFor(() => {
      expect(screen.getByText('Array Sum')).toBeInTheDocument();
    });
  });

  test('displays loading state initially', () => {
    vi.spyOn(problemsApi, 'apiGetProblem').mockImplementation(() => new Promise(() => {}));
    renderPage('p1');
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test('displays error on api failure', async () => {
    vi.spyOn(problemsApi, 'apiGetProblem').mockRejectedValue(new Error('Network error'));
    renderPage('p1');
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  test('fetches problem data on mount', async () => {
    const apiGetProblemSpy = vi.spyOn(problemsApi, 'apiGetProblem');
    renderPage('p1');
    await waitFor(() => {
      expect(apiGetProblemSpy).toHaveBeenCalledWith('token', 'p1');
    });
  });

  test('gets access token before fetching', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('token');
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { user_id: 'user-1', name: 'User', email: 'user@example.com', role: 'candidate' },
      accessToken: 'token',
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken,
    } as any);

    renderPage('p1');
    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalled();
    });
  });

  test('handles missing problem ID gracefully', () => {
    renderPage('');
    expect(screen.queryByText('Loading')).toBeNull();
  });
});

// ── Phase 2: Form & File Interactions ──
describe('ProblemDetailPage - Phase 2: Form & File Interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    
    mockAuth('admin');

    vi.spyOn(problemsApi, 'apiGetProblem').mockResolvedValue({
      problem_id: 'p1',
      title: 'Old Title',
      description: 'Old Desc',
      input_format: 'Old In',
      output_format: 'Old Out',
      sample_input: 'Old Samp In',
      sample_output: 'Old Samp Out',
      difficulty: 'medium',
      time_limit: 2000,
      memory_limit: 512,
      allowed_langs: ['cpp17'],
    } as any);

    vi.spyOn(problemsApi, 'apiListTestCases').mockResolvedValue([
      {
        testcase_id: 'tc1',
        name: 'Initial TC',
        is_hidden: false,
        score_weight: 1,
        time_limit_override: null,
        memory_limit_override: null
      }
    ] as any);
  });

  const setupUser = () => userEvent.setup();

  test('ProblemForm: edits existing problem and saves successfully', async () => {
    const user = setupUser();
    const mockUpdate = vi.spyOn(problemsApi, 'apiUpdateProblem').mockResolvedValue({ problem_id: 'p1' } as any);

    renderPage('p1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('Old Title')).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText(/Title \*/);
    const diffSelect = screen.getByLabelText(/Difficulty/);
    const pythonCheckbox = screen.getByLabelText('python3');
    
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Title');
    await user.selectOptions(diffSelect, 'hard');
    await user.click(pythonCheckbox);

    const saveBtn = screen.getByRole('button', { name: 'Save changes' });
    await user.click(saveBtn);

    expect(mockUpdate).toHaveBeenCalledWith('token', 'p1', expect.objectContaining({
      title: 'Updated Title',
      difficulty: 'hard',
      allowed_langs: ['cpp17', 'python3']
    }));
  });

  test('ProblemForm: validates required fields', async () => {
    const user = setupUser();
    renderPage('p1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('Old Title')).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText(/Title \*/);
    await user.clear(titleInput);

    const saveBtn = screen.getByRole('button', { name: 'Save changes' });
    await user.click(saveBtn);

    expect(screen.getByText('Title is required.')).toBeInTheDocument();
  });

  test('TestCaseModal: adds a new test case with file uploads', async () => {
    const user = setupUser();
    const mockCreateTestCase = vi.spyOn(problemsApi, 'apiCreateTestCase').mockResolvedValue({
      testcase_id: 'tc-new',
      name: 'My New TC',
      is_hidden: true,
      score_weight: 2.5
    } as any);

    renderPage('p1');

    await waitFor(() => {
      expect(screen.getByText('Initial TC')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add Test Case' }));
    expect(screen.getByRole('heading', { name: 'Add Test Case' })).toBeInTheDocument();

    const inFile = new File(['1 2'], 'input.txt', { type: 'text/plain' });
    const outFile = new File(['3'], 'output.txt', { type: 'text/plain' });

    const nameInput = screen.getByLabelText('Name');
    const inputFileInput = screen.getByLabelText('Input file');
    const expectedFileInput = screen.getByLabelText('Expected output file');
    const weightInput = screen.getByLabelText('Score weight');

    await user.clear(nameInput);
    await user.type(nameInput, 'My New TC');

    await user.upload(inputFileInput, inFile);
    await user.upload(expectedFileInput, outFile);

    expect((inputFileInput as HTMLInputElement).files?.[0]?.name).toBe('input.txt');
    expect((expectedFileInput as HTMLInputElement).files?.[0]?.name).toBe('output.txt');

    await user.clear(weightInput);
    await user.type(weightInput, '2.5');

    const uploadBtn = screen.getByRole('button', { name: 'Upload' });
    fireEvent.submit(uploadBtn);

    await waitFor(() => {
      expect(mockCreateTestCase).toHaveBeenCalledWith('token', 'p1', expect.objectContaining({
        inputFile: expect.any(File),
        expectedFile: expect.any(File),
        isHidden: true,
        scoreWeight: 2.5
      }));
    });
  });

  test('TestCaseList: prompts confirmation and deletes test case', async () => {
    const user = setupUser();
    const mockDelete = vi.spyOn(problemsApi, 'apiDeleteTestCase').mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage('p1');

    await waitFor(() => {
      expect(screen.getByText('Initial TC')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalledWith('Delete this test case?');
    expect(mockDelete).toHaveBeenCalledWith('token', 'p1', 'tc1');
  });
});