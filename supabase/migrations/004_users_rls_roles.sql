-- Fix: admins/reviewers could not read their own users row (406 on .single())
-- Old policy only allowed account_type = 'student'.

DROP POLICY IF EXISTS student_own_data ON users;

-- Any authenticated user can read their own profile (student, reviewer, admin)
CREATE POLICY users_select_own ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Students may update their own profile fields
CREATE POLICY students_update_own ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND account_type = 'student')
  WITH CHECK (id = auth.uid() AND account_type = 'student');
