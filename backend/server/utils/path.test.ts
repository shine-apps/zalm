import { describe, expect, it } from 'vitest'
import { isPublicPath, isPublicRequest } from './path'

describe('isPublicPath', () => {
  it('allows the exact /api/health path', () => {
    expect(isPublicPath('/api/health')).toBe(true)
  })

  it('allows Better Auth endpoints under /api/auth/', () => {
    expect(isPublicPath('/api/auth')).toBe(true)
    expect(isPublicPath('/api/auth/sign-in/email')).toBe(true)
    expect(isPublicPath('/api/auth/sign-out')).toBe(true)
  })

  it('does not treat sibling prefixes of /api/health as public', () => {
    expect(isPublicPath('/api/healthcheck')).toBe(false)
    expect(isPublicPath('/api/health-secret')).toBe(false)
    expect(isPublicPath('/api/health2')).toBe(false)
  })

  it('does not treat sibling prefixes of /api/auth as public', () => {
    expect(isPublicPath('/api/authorized')).toBe(false)
    expect(isPublicPath('/api/authenticate')).toBe(false)
  })

  it('allows public avatar reads under /api/uploads/avatars/', () => {
    expect(isPublicPath('/api/uploads/avatars/u-1728000000.jpg')).toBe(true)
  })

  it('does not treat sibling prefixes of /api/uploads as public', () => {
    expect(isPublicPath('/api/uploads-secret')).toBe(false)
    expect(isPublicPath('/api/uploadshook')).toBe(false)
  })

  it('allows public settings reads at /api/settings', () => {
    expect(isPublicPath('/api/settings')).toBe(true)
    expect(isPublicPath('/api/settings/site.title')).toBe(true)
  })

  it('does not treat sibling prefixes of /api/settings as public', () => {
    expect(isPublicPath('/api/settings-secret')).toBe(false)
    expect(isPublicPath('/api/settingshook')).toBe(false)
  })

  it('keeps admin settings endpoints authenticated despite the public prefix', () => {
    expect(isPublicPath('/api/admin/settings')).toBe(false)
    expect(isPublicPath('/api/admin/settings/site.title')).toBe(false)
  })

  it('requires authentication for regular API paths', () => {
    expect(isPublicPath('/api/me')).toBe(false)
    expect(isPublicPath('/api/media/register')).toBe(false)
    expect(isPublicPath('/api/admin/users')).toBe(false)
  })
})

describe('isPublicRequest', () => {
  it('allows guest GET on activity collection and detail', () => {
    expect(isPublicRequest('/api/activities', 'GET')).toBe(true)
    expect(isPublicRequest('/api/activities/550e8400-e29b-41d4-a716-446655440000', 'GET')).toBe(true)
  })

  it('keeps deeper activity paths authenticated even for GET', () => {
    expect(isPublicRequest('/api/activities/mine/registrations', 'GET')).toBe(false)
    expect(isPublicRequest('/api/activities/x/registrations', 'GET')).toBe(false)
    expect(isPublicRequest('/api/activities/x/check-in-code', 'GET')).toBe(false)
  })

  it('keeps activity write methods authenticated', () => {
    expect(isPublicRequest('/api/activities', 'POST')).toBe(false)
    expect(isPublicRequest('/api/activities/x', 'PUT')).toBe(false)
    expect(isPublicRequest('/api/activities/x/register', 'POST')).toBe(false)
  })

  it('still honors prefix-based public paths for any method', () => {
    expect(isPublicRequest('/api/health', 'GET')).toBe(true)
    expect(isPublicRequest('/api/auth/sign-in/email', 'POST')).toBe(true)
  })
})
