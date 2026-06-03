import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import * as useAuthHook from '../src/hooks/useAuth';
import * as examsApi from '../src/api/exams';
import * as problemsApi from '../src/api/problems';
import * as adminApi from '../src/api/admin';
import ExamDetail from '../src/pages/ExamDetail';

// Define mock function globally so vi.mock can access it during hoisting
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as any),
    useNavigate: () => mockNavigate,
  };
});

describe('ExamDetail', () => {
  const mockGetAccessToken = vi.fn();

  // Prepare shared mock data
  const mockExamData = {
    exam_id: 'e1',
    title: 'Midterm Exam',
    description: 'This is a test exam',
    start_time: '2026-06-01T10:00:00Z',
    end_time: '2026-06-01T12:00:00Z',
    show_score: true
  };
  
  const mockProblems = [
    { problem_id: 'p1', title: 'A+B Problem', difficulty: 'easy' },
    { problem_id: 'p2', title: 'Hard DP', difficulty: 'hard' }
  ];
  
  const mockCandidates = {
    items: [
      { user_id: 'c1', name: 'Alice', email: 'alice@test.com' },
      { user_id: 'c2', name: 'Bob', email: 'bob@test.com' }
    ]
  };
  
  const mockAssignments = [
    { assignment_id: 'a1', candidate_id: 'c1', problem_id: 'p1' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({ getAccessToken: mockGetAccessToken } as any);
    
    // Default all APIs to return successful responses
    mockGetAccessToken.mockResolvedValue('fake-token');
    vi.spyOn(examsApi, 'apiGetExam').mockResolvedValue(mockExamData as any);
    vi.spyOn(examsApi, 'apiListExamProblems').mockResolvedValue([mockProblems[0]] as any);
    vi.spyOn(problemsApi, 'apiListProblems').mockResolvedValue(mockProblems as any);
    vi.spyOn(adminApi, 'apiListAdminUsers').mockResolvedValue(mockCandidates as any);
    vi.spyOn(examsApi, 'apiListAssignments').mockResolvedValue(mockAssignments as any);
  });

  // Helper function to render component with routing context
  const renderComponent = () => {
    return render(
      <MemoryRouter initialEntries={['/exams/e1/manage']}>
        <Routes>
          <Route path="/exams/:examId/manage" element={<ExamDetail />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('1. should show loading state initially', () => {
    // Mock an unresolved Promise to keep it in loading state
    mockGetAccessToken.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText('Loading Exam Details...')).toBeInTheDocument();
  });

  it('2. should show error message when API fails', async () => {
    vi.spyOn(examsApi, 'apiGetExam').mockRejectedValue(new Error('Exam not found'));
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Error: Exam not found')).toBeInTheDocument();
    });
  });

  it('3. should load data and display correct info in view mode', async () => {
    renderComponent();

    // Check basic information
    await waitFor(() => {
      expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    });
    expect(screen.getByText('This is a test exam')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument(); 

    // Check assigned problems and candidates
    expect(screen.getByText('A+B Problem')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();

    // Ensure unassigned entities are not displayed
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Hard DP')).not.toBeInTheDocument();
  });

  it('4. should navigate to dashboard on back button click', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: '← Back to Dashboard' });
    await user.click(backBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/interviewer');
  });
  it('5. should enter edit mode and modify form fields', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    });

    // Enter edit mode
    const editBtn = screen.getByRole('button', { name: 'Edit' });
    await user.click(editBtn);

    // Verify inputs appear
    const titleInput = screen.getByDisplayValue('Midterm Exam');
    expect(titleInput).toBeInTheDocument();

    // Type new title
    await user.clear(titleInput);
    await user.type(titleInput, 'Final Exam');
    expect(titleInput).toHaveValue('Final Exam');

    // Cancel edit
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);

    // Should discard changes and show original title
    expect(screen.queryByDisplayValue('Final Exam')).not.toBeInTheDocument();
    expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
  });

  it('6. should filter problems and candidates in edit mode', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    // Test Problem Search
    const problemSearchInput = screen.getByPlaceholderText('Search problems...');
    await user.type(problemSearchInput, 'Hard');
    
    // Hard DP should be visible, A+B Problem should be hidden
    expect(screen.getByText('Hard DP')).toBeInTheDocument();
    expect(screen.queryByText('A+B Problem')).not.toBeInTheDocument();

    // Test Candidate Search
    const candidateSearchInput = screen.getByPlaceholderText('Search name or email...');
    await user.type(candidateSearchInput, 'Bob');
    
    // Bob should be visible, Alice should be hidden
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('7. should toggle select all and clear buttons for problems and candidates', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    // By default, Alice(c1) and A+B Problem(p1) are assigned based on our mock data.
    // There are two "Select All" and "Clear" buttons (index 0 for problems, index 1 for candidates)
    const selectAllBtns = screen.getAllByRole('button', { name: 'Select All' });
    const clearBtns = screen.getAllByRole('button', { name: 'Clear' });

    // Select all candidates
    await user.click(selectAllBtns[1]);
    
    // Clear all problems
    await user.click(clearBtns[0]);

    // Manually toggle a problem checkbox by clicking its title label
    await user.click(screen.getByText('Hard DP'));
  });

  it('8. should save exam changes and update assignments correctly', async () => {
    const user = userEvent.setup();
    
    // Mock API calls for save operation
    const mockUpdateExam = vi.spyOn(examsApi, 'apiUpdateExam').mockResolvedValue({} as any);
    const mockCreateAssignment = vi.spyOn(examsApi, 'apiCreateAssignment').mockResolvedValue({} as any);
    const mockDeleteAssignment = vi.spyOn(examsApi, 'apiDeleteAssignment').mockResolvedValue({} as any);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    // Modify assignments: Deselect Alice, Select Bob
    await user.click(screen.getByText('Alice')); 
    await user.click(screen.getByText('Bob')); 

    // Click Save
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    await user.click(saveBtn);

    // Verify API calls
    expect(mockUpdateExam).toHaveBeenCalledWith('fake-token', 'e1', expect.any(Object));
    
    // Original was a1(c1_p1). We removed c1 and added c2, so we expect a delete for a1 and a create for c2_p1.
    expect(mockDeleteAssignment).toHaveBeenCalledWith('fake-token', 'e1', 'a1');
    expect(mockCreateAssignment).toHaveBeenCalledWith('fake-token', 'e1', { candidate_id: 'c2', problem_id: 'p1' });
  });

  it('9. should prompt confirmation and delete exam', async () => {
    const user = userEvent.setup();
    const mockDeleteExam = vi.spyOn(examsApi, 'apiDeleteExam').mockResolvedValue({} as any);
    
    // Mock window.confirm to return true
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Midterm Exam')).toBeInTheDocument();
    });

    // Click Delete
    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);

    // Verify actions
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Are you sure you want to delete'));
    expect(mockDeleteExam).toHaveBeenCalledWith('fake-token', 'e1');
    expect(mockNavigate).toHaveBeenCalledWith('/interviewer');
  });
});