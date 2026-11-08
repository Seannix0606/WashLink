import { NotificationService } from '../../application/services/NotificationService'
import { SupabaseNotificationRepository } from '../../infrastructure/repositories/SupabaseNotificationRepository'

export interface NotificationDependencies {
  readonly notificationService: NotificationService
}

export function createNotificationDependencies(): NotificationDependencies {
  return {
    notificationService: new NotificationService(new SupabaseNotificationRepository()),
  }
}
