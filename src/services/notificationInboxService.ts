import { apiFetch } from './apiClient';

export type InboxNotification = {
  id: string;
  channel: 'push' | 'in_app' | 'email' | 'whatsapp';
  title: string;
  body: string;
  sentAtISO: string | null;
  readAtISO: string | null;
  dismissedAtISO: string | null;
  createdAtISO: string;
};

export const getNotificationInbox = () =>
  apiFetch<{ items: InboxNotification[] }>('/v1/platform/notifications');

export const updateNotificationInboxItem = (notificationId: string, action: 'read' | 'unread' | 'dismiss') =>
  apiFetch<InboxNotification>(`/v1/platform/notifications/${encodeURIComponent(notificationId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
