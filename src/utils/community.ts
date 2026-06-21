import type { CommunityPostSummary, Story } from '@/types/community'

const FALLBACK_IMAGES = [
  '/images/성심당문화원/성심당문화원_1_공공3유형.JPG',
  '/images/한밭수목원/한밭수목원_1_공공3유형.jpg',
  '/images/국립중앙과학관/국립중앙과학관_1_공공1유형.jpg',
  '/images/대전오월드/대전오월드_1_공공3유형.jpg',
]

function fallbackImage(postId: string): string {
  const seed = [...postId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return FALLBACK_IMAGES[seed % FALLBACK_IMAGES.length]
}

export function communityPostToStory(post: CommunityPostSummary): Story {
  return {
    id: post.id,
    type: 'story',
    author: post.publishedBy?.displayName ?? '숨길 여행자',
    authorUserId: post.publishedBy?.id,
    avatar: (post.publishedBy?.displayName ?? '?').slice(0, 1),
    location: post.hashtags?.[0] ?? '여행 기록',
    title: post.title,
    image: post.coverMedia?.publicUrl ?? fallbackImage(post.id),
    likes: post.likeCount ?? 0,
    comments: post.commentCount ?? 0,
    tags: post.hashtags ?? [],
    summary: post.summary ?? '',
    content: post.summary ?? '',
    tip: '',
    photos: [],
  }
}
