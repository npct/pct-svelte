import type { Toast } from './types';

class ToastStore {
  toasts = $state<Toast[]>([]);
  private recentMessages = new Map<string, number>();

  add(message: string, type: Toast['type'] = 'info', title?: string, duration = 4000) {
    const now = Date.now();
    const lastShown = this.recentMessages.get(message);
    
    // Deduplicate identical toast messages within 3 seconds
    if (lastShown && now - lastShown < 3000) {
      return;
    }
    
    this.recentMessages.set(message, now);

    const id = Math.random().toString(36).substring(2, 9);
    const toast: Toast = {
      id,
      title,
      message,
      type,
      timestamp: now,
      duration
    };

    this.toasts.push(toast);

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  remove(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  clear() {
    this.toasts = [];
  }
}

export const toastStore = new ToastStore();
