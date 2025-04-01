export const ls = {
  getItem(key:string): any|null {
    if (window) {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    }
  },
  setItem(key:string, value: any): void {
    if (window) window.localStorage.setItem(key, JSON.stringify(value));
  },
  removeItem(key: string): void {
    if (window) window.localStorage.removeItem(key)
  },
}
