import { app } from '../src/index'
import { describe, expect, it } from 'bun:test'

describe('General', () => {
	it('home route redirects to github', async () => {
		const response = await app.handle(new Request('http://localhost/'))
		expect(response.headers.get('Location')).toBe('https://github.com/henrygd/ncaa-api')
	})
	it('invalid route returns 400', async () => {
		const response = await app.handle(new Request('http://localhost/invalid'))
		expect(response.status).toBe(400)
	})
	it('invalid page param returns 400', async () => {
		const response = await app.handle(new Request('http://localhost/stats/test?page=invalid'))
		expect(response.status).toBe(400)
	})
	it('rankings route returns good data', async () => {
		const response = await app.handle(
			new Request('http://localhost/rankings/football/fbs/associated-press')
		)
		expect(response.status).toBe(200)
		const { data } = await response.json()
		expect(data.length).toBeGreaterThan(0)
		expect(data[0]).toContainKeys(['RANK', 'SCHOOL'])
	})
	it('scoreboard route returns good data', async () => {
		const response = await app.handle(
			new Request('http://localhost/scoreboard/basketball-men/d1/2024/01/01')
		)
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data).toContainKey('games')
	})
	it('game boxscore route returns good data', async () => {
		const response = await app.handle(new Request('http://localhost/game/6351551'))
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data).toContainKey('teams')
		expect(data.meta.title).toContain('oxscore')
		expect(data.meta).toContainKeys(['status', 'period', 'teams'])
	})
	it('game play by play route returns good data', async () => {
		const response = await app.handle(new Request('http://localhost/game/6305900/play-by-play'))
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data).toContainKey('periods')
		expect(data.meta.title).toBe('PLAY-BY-PLAY')
		expect(data.meta).toContainKeys(['title', 'teams'])
	})
	it('game team stats route returns good data', async () => {
		const response = await app.handle(new Request('http://localhost/game/6305900/team-stats'))
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data).toContainKey('teams')
		expect(data.meta.title).toBe('TEAM STATS')
		expect(data.meta).toContainKeys(['title', 'teams'])
	})
	it('game scoring summary route returns good data', async () => {
		const response = await app.handle(new Request('http://localhost/game/6305900/scoring-summary'))
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data).toContainKey('periods')
		expect(data.meta.title).toBe('SCORING')
		expect(data.meta).toContainKeys(['title', 'teams'])
	})
	it('re-request uses cached data', async () => {
		const start = performance.now()
		await app.handle(new Request('http://localhost/rankings/football/fbs/associated-press'))
		const finish = performance.now() - start
		expect(finish).toBeLessThan(10)
	})
	it('semaphore queues simultaneous requests for same scoreboard resource', async () => {
		const requests = []
		// will fail when baseball season starts again bc date will be different
		// should be replace with whatever sport has the longest until it starts again
		const routes = ['/scoreboard/baseball/d1', '/scoreboard/baseball/d1/2024/06/24/all-conf']
		for (let i = 0; i < 3; i++) {
			for (const route of routes) {
				requests.push(
					app.handle(new Request(`http://localhost${route}`)).then((res) => res.headers)
				)
			}
		}
		const headers = await Promise.all(requests)
		let nonCached = 0
		let cached = 0
		for (const header of headers) {
			if (header.get('x-score-cache') === 'hit') {
				cached++
			} else {
				nonCached++
			}
		}
		expect(nonCached).toBe(1)
		expect(cached).toBe(headers.length - 1)
	})
})

describe('Header validation', () => {
	// Custom header tests (must be last due to env var)
	it('valid custom header returns 200', async () => {
		Bun.env.NCAA_HEADER_KEY = 'valid'
		const response = await app.handle(
			new Request('http://localhost/rankings/football/fbs/associated-press', {
				headers: { 'x-ncaa-key': 'valid' },
			})
		)
		expect(response.status).toBe(200)
	})
	it('invalid custom header returns 401', async () => {
		const response = await app.handle(
			new Request('http://localhost/test', { headers: { 'x-ncaa-key': 'invalid' } })
		)
		expect(response.status).toBe(401)
	})
	it('lack of custom header returns 401', async () => {
		const response = await app.handle(new Request('http://localhost/stats/test'))
		expect(response.status).toBe(401)
	})
})
