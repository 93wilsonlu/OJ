-- Sample seed data for local development.
-- Run from the repo root:
--   docker compose exec -T postgres psql -U oj -d oj < backend/seed_sample_exam.sql
--
-- Candidate login password for all seeded candidates: Candidate123!

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH sample_candidates(user_id, name, email) AS (
    VALUES
        ('11111111-1111-4111-8111-111111111111'::uuid, 'Alice Candidate', 'alice.candidate@example.com'),
        ('22222222-2222-4222-8222-222222222222'::uuid, 'Bob Candidate', 'bob.candidate@example.com'),
        ('33333333-3333-4333-8333-333333333333'::uuid, 'Carol Candidate', 'carol.candidate@example.com'),
        ('44444444-4444-4444-8444-444444444444'::uuid, 'David Candidate', 'david.candidate@example.com')
)
INSERT INTO users (user_id, name, email, password_hash, role, is_active, created_at, updated_at)
SELECT
    user_id,
    name,
    email,
    crypt('Candidate123!', gen_salt('bf', 10)),
    'candidate',
    true,
    now(),
    now()
FROM sample_candidates
ON CONFLICT (email) DO UPDATE
SET
    name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = 'candidate',
    is_active = true,
    updated_at = now();

WITH sample_problems(
    problem_id,
    title,
    description,
    input_format,
    output_format,
    sample_input,
    sample_output,
    difficulty,
    time_limit,
    memory_limit,
    allowed_langs
) AS (
    VALUES
        (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
            'Two Sum',
            'Given two integers a and b, output their sum.',
            'Two integers a and b on one line.',
            'Print one integer: a + b.',
            '3 5',
            '8',
            'easy',
            1000,
            128,
            ARRAY['python3', 'cpp17']::text[]
        ),
        (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid,
            'Reverse Words',
            'Given a line of words, print the words in reverse order.',
            'One line containing space-separated words.',
            'The same words in reverse order.',
            'hello online judge',
            'judge online hello',
            'easy',
            1000,
            128,
            ARRAY['python3', 'cpp17']::text[]
        ),
        (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
            'Longest Increasing Subsequence',
            'Given an integer array, output the length of its longest strictly increasing subsequence.',
            'First line: n. Second line: n integers.',
            'Print the LIS length.',
            E'6\n10 20 10 30 20 50',
            '4',
            'medium',
            2000,
            256,
            ARRAY['python3', 'cpp17']::text[]
        ),
        (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid,
            'Grid Shortest Path',
            'Given a grid with obstacles, find the shortest path length from S to T.',
            'First line: h w. Next h lines: grid characters S, T, ., #.',
            'Print the shortest path length, or -1 if unreachable.',
            E'3 4\nS..#\n.#..\n..T.',
            '4',
            'medium',
            2000,
            256,
            ARRAY['python3', 'cpp17']::text[]
        ),
        (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'::uuid,
            'Segment Tree Query',
            'Maintain an array with point updates and range sum queries.',
            'First line: n q. Second line: n integers. Next q lines: commands set i x or sum l r.',
            'For each sum query, print the range sum.',
            E'5 3\n1 2 3 4 5\nsum 1 3\nset 2 10\nsum 1 3',
            E'6\n14',
            'hard',
            3000,
            512,
            ARRAY['python3', 'cpp17']::text[]
        )
)
INSERT INTO problems (
    problem_id,
    title,
    description,
    input_format,
    output_format,
    sample_input,
    sample_output,
    difficulty,
    time_limit,
    memory_limit,
    allowed_langs,
    created_by,
    created_at
)
SELECT
    problem_id,
    title,
    description,
    input_format,
    output_format,
    sample_input,
    sample_output,
    difficulty,
    time_limit,
    memory_limit,
    allowed_langs,
    NULL,
    now()
FROM sample_problems
ON CONFLICT (problem_id) DO UPDATE
SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    input_format = EXCLUDED.input_format,
    output_format = EXCLUDED.output_format,
    sample_input = EXCLUDED.sample_input,
    sample_output = EXCLUDED.sample_output,
    difficulty = EXCLUDED.difficulty,
    time_limit = EXCLUDED.time_limit,
    memory_limit = EXCLUDED.memory_limit,
    allowed_langs = EXCLUDED.allowed_langs;

INSERT INTO exams (
    exam_id,
    title,
    description,
    start_time,
    end_time,
    show_score,
    created_by,
    created_at
)
VALUES (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    'Sample Coding Interview',
    'Seeded exam with sample candidates and problems.',
    now() - interval '10 minutes',
    now() + interval '7 days',
    true,
    NULL,
    now()
)
ON CONFLICT (exam_id) DO UPDATE
SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    show_score = EXCLUDED.show_score;

WITH picked_assignments(candidate_email, problem_id, assigned_difficulty) AS (
    VALUES
        ('alice.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'easy'),
        ('alice.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid, 'medium'),
        ('alice.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'::uuid, 'hard'),
        ('bob.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'easy'),
        ('bob.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'easy'),
        ('bob.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid, 'medium'),
        ('carol.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 'easy'),
        ('carol.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid, 'medium'),
        ('david.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'easy'),
        ('david.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid, 'medium'),
        ('david.candidate@example.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'::uuid, 'hard')
)
INSERT INTO exam_assignments (
    assignment_id,
    exam_id,
    candidate_id,
    problem_id,
    assigned_difficulty,
    created_at
)
SELECT
    gen_random_uuid(),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    users.user_id,
    picked_assignments.problem_id,
    picked_assignments.assigned_difficulty,
    now()
FROM picked_assignments
JOIN users ON users.email = picked_assignments.candidate_email
ON CONFLICT ON CONSTRAINT uq_exam_candidate_problem DO UPDATE
SET assigned_difficulty = EXCLUDED.assigned_difficulty;

COMMIT;
