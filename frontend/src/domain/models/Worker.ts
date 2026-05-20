export interface Worker {
  readonly workerIdentifier: string
  readonly workerName: string
  readonly workerPhoneNumber: string
  readonly isAvailable: boolean
}

export interface CreateWorkerInput {
  readonly name: string
  readonly phoneNumber: string
}
