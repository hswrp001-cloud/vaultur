import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig(async () => {
	const migrationsPath = new URL("./migrations", import.meta.url).pathname
	const migrations = await readD1Migrations(migrationsPath)

	return {
		plugins: [
			cloudflareTest({
				main: "./src/index.ts",
				miniflare: {
					compatibilityDate: "2025-09-06",
					compatibilityFlags: ["nodejs_compat"],
					d1Databases: ["VAULTUR_DB"],
					kvNamespaces: ["VAULTUR_KV"],
					r2Buckets: ["VAULTUR_FILES"],
					durableObjects: {
						VAULTUR_NOTIFICATIONS: "NotificationsHub",
						VAULTUR_HEAVY: "HeavyCompute"
					},
					bindings: {
						TEST_MIGRATIONS: migrations,
						JWT_SECRET: "vaultur-test-jwt-secret-vaultur-test-jwt-secret",
						ADMIN_TOKEN: "vaultur-test-admin-token",
						SIGNUPS_ALLOWED: "true"
					}
				}
			})
		],
		test: {
			include: ["test/heavy-compute.spec.ts"],
			setupFiles: ["./test/apply-migrations.ts"]
		}
	}
})
