import request from '@/utils/request';

export function getRecommendedPodcasts() {
  return request({
    url: '/dj/recommend',
    method: 'get',
  });
}

export function getPodcastDetail(id) {
  return request({
    url: '/dj/detail',
    method: 'get',
    params: { rid: id },
  });
}

export function getPodcastPrograms({ id, limit = 100, offset = 0 }) {
  return request({
    url: '/dj/program',
    method: 'get',
    params: {
      rid: id,
      limit,
      offset,
      asc: false,
    },
  });
}
