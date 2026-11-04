/** W16 D-86 (F-S2, W16-L4): what deleting a shop removes, stated before the owner confirms. Not a guard. */
export function shopRemovalConfirmationText(shopName: string): string {
  return `Remove ${shopName}? Customers will no longer be able to book this shop. Its job openings and the applications to them, including applicants' notes, are permanently deleted; applicants are told only that an application ended. Open training stays open and you can no longer cancel it after removal; cancel it first if it should end. This cannot be undone.`
}
