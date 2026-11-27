// /api/board/posts, /api/board/posts/[postId]

import { guarded } from '../core/server';
import { getPost, listPosts } from '../server/posts';

export const listHandler = guarded(async () => Response.json({ posts: await listPosts() }));

export const getHandler = guarded(async (_request, { postId }) => Response.json({ post: await getPost(postId) }));
