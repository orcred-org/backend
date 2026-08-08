/** When true (default), only admin accounts may receive magic links or complete sign-in. */
export function isAdminOnlyAuth(): boolean {
  return process.env.ADMIN_ONLY_AUTH !== 'false';
}

/** When true, students can create new verification applications via the API. */
export function isStudentApplyEnabled(): boolean {
  return process.env.STUDENT_APPLY_ENABLED === 'true';
}
