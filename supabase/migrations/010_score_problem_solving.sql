-- Align score columns with rubric: problem solving (not originality)

ALTER TABLE scores RENAME COLUMN originality TO problem_solving;
ALTER TABLE scores RENAME COLUMN feedback_orig TO feedback_ps;
