import { logger } from '../utils/logger.js';
import { ConfigError } from '../utils/errors.js';

type KeytarModule = {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
};

export type StoredToken = {
	refreshToken: string;
	accessToken?: string;
	expiresAt?: string;
	tokenType?: 'bearer';
	scope?: string;
	receivedAt?: string;
};

export interface TokenStore {
	available(): Promise<boolean> | boolean;
	get(profileName: string): Promise<StoredToken | null>;
	set(profileName: string, value: StoredToken): Promise<void>;
	delete(profileName: string): Promise<void>;
}

const KEYCHAIN_REQUIRED_MESSAGE =
	'OS keychain unavailable. Install optional "keytar" dependency to store tokens securely (file-based token storage has been removed).';

/**
 * Token storage implementation using the OS keychain (via keytar).
 * Uses a dynamic import so the CLI still starts even if keytar is missing,
 * but operations will fail with a ConfigError until keytar is installed.
 */
export class KeychainTokenStore implements TokenStore {
	private keytar: KeytarModule | null = null;
	private readonly service: string;

	constructor(service = 'opkg-cli') {
		this.service = service;
	}

	async available(): Promise<boolean> {
		return !!(await this.ensureKeytar());
	}

	async get(profileName: string): Promise<StoredToken | null> {
		const keytar = await this.requireKeytar();

		const raw = await keytar.getPassword(this.service, profileName);
		if (!raw) return null;

		try {
			return JSON.parse(raw) as StoredToken;
		} catch (error) {
			logger.warn('Failed to parse keychain token entry, deleting it', { error });
			await keytar.deletePassword(this.service, profileName);
			return null;
		}
	}

	async set(profileName: string, value: StoredToken): Promise<void> {
		const keytar = await this.requireKeytar();
		await keytar.setPassword(this.service, profileName, JSON.stringify(value));
	}

	async delete(profileName: string): Promise<void> {
		const keytar = await this.requireKeytar();
		await keytar.deletePassword(this.service, profileName);
	}

	private async requireKeytar(): Promise<KeytarModule> {
		const keytar = await this.ensureKeytar();
		if (!keytar) {
			throw new ConfigError(KEYCHAIN_REQUIRED_MESSAGE);
		}
		return keytar;
	}

	private async ensureKeytar(): Promise<KeytarModule | null> {
		if (this.keytar) {
			return this.keytar;
		}

		try {
			const mod = (await import('keytar')) as KeytarModule;
			this.keytar = mod;
			return mod;
		} catch (error) {
			logger.warn('Keychain (keytar) not available', { error });
			this.keytar = null;
			return null;
		}
	}
}

/**
 * Factory that returns a keychain-backed token store.
 * Throws a ConfigError when the OS keychain/keytar is unavailable.
 */
export async function createTokenStore(): Promise<TokenStore> {
	const keychainStore = new KeychainTokenStore();
	if (await keychainStore.available()) {
		return keychainStore;
	}

	throw new ConfigError(KEYCHAIN_REQUIRED_MESSAGE);
}

