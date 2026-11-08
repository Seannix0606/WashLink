/** Shown before deletion: the database refuses to delete a profile that has certificates (W7). */
export const workerProfileDeleteCertificationNote =
  'A profile with shop-issued certifications cannot be deleted. To remove it, delete your account instead.'

export const workerProfileDeleteConfirmText = `Delete your worker profile? This cannot be undone. ${workerProfileDeleteCertificationNote}`
