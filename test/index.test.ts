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
	it('re-request uses cached data', async () => {
		const start = performance.now()
		await app.handle(new Request('http://localhost/rankings/football/fbs/associated-press'))
		const finish = performance.now() - start
		expect(finish).toBeLessThan(10)
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
