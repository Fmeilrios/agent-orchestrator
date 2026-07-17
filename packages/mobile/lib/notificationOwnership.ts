export interface NotificationOwnershipStorage {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
}

export function notificationOwnership(storage: NotificationOwnershipStorage, key: string) {
	let pending = Promise.resolve();
	const serialize = (update: () => Promise<void>) => {
		const result = pending.then(update);
		pending = result.catch(() => {});
		return result;
	};
	return {
		remember: (id: string) => serialize(() => storage.setItem(key, id)),
		forget: (id: string) =>
			serialize(async () => {
				if ((await storage.getItem(key)) === id) await storage.removeItem(key);
			}),
	};
}
