export interface UserNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}
