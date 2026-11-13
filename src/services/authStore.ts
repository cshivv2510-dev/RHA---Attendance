/**
 * Tiny external store for the signed-in user's display name,
 * so non-React services can attribute scans without hooks.
 */

let currentName: string | undefined;

export const useAuthStore = {
  setName(name: string | undefined) {
    currentName = name;
  },
  getName(): string | undefined {
    return currentName;
  },
};
