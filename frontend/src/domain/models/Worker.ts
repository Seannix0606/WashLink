export interface Worker {
  readonly workerIdentifier: string
  readonly workerName: string
  readonly workerPhoneNumber: string
  readonly isAvailable: boolean
  /** True when a worker account accepted a link code for this roster row (workers.user_id set). */
  readonly isLinkedToAccount: boolean
}

export interface CreateWorkerInput {
  readonly name: string
  readonly phoneNumber: string
}
