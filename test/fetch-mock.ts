import { vi } from "vitest"

type MockRequest = { path: string; body: string }
type MockBody =
	| string
	| object
	| ((request: MockRequest) => string | object | Promise<string | object>)
type Interceptor = {
	origin: string
	method: string
	path: string | ((path: string) => boolean)
	status: number
	body: MockBody
	persistent: boolean
}

const interceptors: Interceptor[] = []
let fetchSpy: ReturnType<typeof vi.spyOn> | undefined

/** Outbound fetch mock for Worker tests. Unknown requests fail closed. */
export const fetchMock = {
	activate() {
		fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = new Request(input, init)
			const url = new URL(request.url)
			const path = url.pathname + url.search
			const index = interceptors.findIndex(
				(entry) =>
					entry.origin === url.origin &&
					entry.method === request.method &&
					(typeof entry.path === "string" ? entry.path === path : entry.path(path))
			)
			if (index < 0) throw new Error(`Unexpected outbound fetch: ${request.method} ${url}`)
			const entry = interceptors[index]!
			if (!entry.persistent) interceptors.splice(index, 1)
			const body =
				typeof entry.body === "function"
					? await entry.body({ path, body: new TextDecoder().decode(await request.arrayBuffer()) })
					: entry.body
			return new Response(typeof body === "string" ? body : JSON.stringify(body), {
				status: entry.status,
				headers: { "Content-Type": typeof body === "string" ? "text/plain" : "application/json" }
			})
		})
	},
	disableNetConnect() {
		// The spy above rejects every request without an explicit interceptor.
	},
	deactivate() {
		fetchSpy?.mockRestore()
		fetchSpy = undefined
		interceptors.length = 0
	},
	assertNoPendingInterceptors() {
		const pending = interceptors.filter((entry) => !entry.persistent)
		if (pending.length) {
			throw new Error(`Unused outbound fetch interceptors: ${pending.length}`)
		}
	},
	get(origin: string) {
		return {
			intercept({ method, path }: { method: string; path: string | ((path: string) => boolean) }) {
				return {
					reply(status: number, body: MockBody) {
						const entry: Interceptor = {
							origin,
							method,
							path,
							status,
							body,
							persistent: false
						}
						interceptors.push(entry)
						return {
							persist() {
								entry.persistent = true
							}
						}
					}
				}
			}
		}
	}
}
