import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/api/http', () => ({
  default: { get, post, delete: del },
}))

import { mediaApi } from '@/api/media.api'

describe('media API', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    del.mockReset()
    vi.unstubAllGlobals()
  })

  it('filters record photos through the contract collection endpoint', async () => {
    const payload = { items: [], page: { page: 0, size: 100, totalElements: 0, totalPages: 0 } }
    get.mockResolvedValue({ data: payload })

    await expect(mediaApi.getRecordPhotos('trip-1')).resolves.toEqual(payload)
    expect(get).toHaveBeenCalledWith('/records/photos', {
      params: { tripId: 'trip-1', page: 0, size: 100 },
    })
  })

  it('uploads a file directly to storage and registers its metadata', async () => {
    const file = new File(['image'], 'avatar.jpg', { type: 'image/jpeg' })
    const upload = {
      uploadUrl: 'https://storage.example.com/signed-upload',
      method: 'PUT',
      objectKey: 'media/users/user-1/profile-image/avatar.jpg',
      headers: { 'Content-Type': 'image/jpeg', 'x-amz-checksum-sha256': 'checksum' },
      expiresAt: '2026-06-21T07:00:00Z',
    }
    const mediaFile = {
      id: 'media-1',
      publicUrl: 'https://cdn.example.com/avatar.jpg',
      mimeType: 'image/jpeg',
      byteSize: file.size,
      width: 320,
      height: 320,
      status: 'ACTIVE',
      createdAt: '2026-06-21T06:00:00Z',
    }
    const storageUpload = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', storageUpload)
    post.mockResolvedValueOnce({ data: upload }).mockResolvedValueOnce({ data: mediaFile })

    const result = await mediaApi.uploadFile(file, 'PROFILE_IMAGE', { width: 320, height: 320 })

    expect(post).toHaveBeenNthCalledWith(1, '/media/upload-urls', {
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
      byteSize: file.size,
      purpose: 'PROFILE_IMAGE',
    })
    expect(storageUpload).toHaveBeenCalledWith(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.headers,
      body: file,
    })
    expect(post).toHaveBeenNthCalledWith(2, '/media/files', {
      objectKey: upload.objectKey,
      mimeType: 'image/jpeg',
      byteSize: file.size,
      width: 320,
      height: 320,
    })
    expect(result).toEqual(mediaFile)
  })

  it('stops before registration when storage upload fails', async () => {
    const file = new File(['photo'], 'record.png', { type: 'image/png' })
    post.mockResolvedValueOnce({
      data: {
        uploadUrl: 'https://storage.example.com/signed-upload',
        method: 'PUT',
        objectKey: 'media/record.png',
        headers: { 'Content-Type': 'image/png' },
        expiresAt: '2026-06-21T07:00:00Z',
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

    await expect(mediaApi.uploadFile(file, 'TRIP_RECORD')).rejects.toThrow('파일 저장소 업로드에 실패했습니다.')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('deletes registered media through the contract path', async () => {
    del.mockResolvedValue({ status: 204 })

    await mediaApi.delete('media-1')

    expect(del).toHaveBeenCalledWith('/media/files/media-1')
  })
})
