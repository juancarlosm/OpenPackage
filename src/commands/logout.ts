import { Command } from 'commander'
import { withErrorHandling } from '../utils/errors.js'
import { authManager } from '../core/auth.js'
import { createTokenStore } from '../core/token-store.js'
import { createHttpClient } from '../utils/http-client.js'
import { logger } from '../utils/logger.js'

type LogoutOptions = {
	profile?: string
}

export function setupLogoutCommand(program: Command): void {
	program
		.command('logout')
		.description('Revoke OAuth session and remove stored tokens')
		.option('--profile <profile>', 'profile to log out')
		.action(
			withErrorHandling(async (options: LogoutOptions) => {
				const profileName = authManager.getCurrentProfile({
					profile: options.profile,
				})

				if (profileName === '<api-key>') {
					console.log('No OAuth session for direct API key usage.')
					return
				}

				const tokenStore = await createTokenStore()
				const tokens = await tokenStore.get(profileName)

				if (!tokens?.refreshToken) {
					if (tokens) {
						await tokenStore.delete(profileName)
					}
					console.log(`No OAuth tokens found for profile "${profileName}".`)
					return
				}

				const client = await createHttpClient({ profile: profileName })

				try {
					await client.post(
						'/auth/logout',
						{ refreshToken: tokens.refreshToken },
						{ headers: { 'Content-Type': 'application/json' } },
					)
					console.log('✓ Server session revoked.')
				} catch (error: any) {
					logger.debug('Failed to revoke server session', { error })
					console.log(
						'⚠️ Could not revoke server session. Clearing local tokens anyway.',
					)
				}

				await tokenStore.delete(profileName)

				console.log(`✓ Local tokens removed for profile "${profileName}".`)
			}),
		)
}

