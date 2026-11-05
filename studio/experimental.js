// SPDX-License-Identifier: GPL-3.0-only
import { EXPERIMENTAL_POSES } from './experimental-catalog.js';
export { EXPERIMENTAL_POSES };
const cache = new Map();
export function experimentalPose(id) {
  if (!Object.hasOwn(EXPERIMENTAL_POSES, id)) throw Error('Unknown experimental pose');
  if (!cache.has(id)) cache.set(id, fetch(new URL(`../data/experimental-poses/${id}.json`, import.meta.url))
    .then(async response => {
      if (!response.ok) throw Error('Experimental pose unavailable');
      const data = await response.json();
      if (data.id !== id || data.schema !== 'pose-atlas/experimental-pose@1' || data.status !== 'experimental-unapproved')
        throw Error('Invalid experimental pose');
      return data;
    }).catch(error => { cache.delete(id); throw error; }));
  return cache.get(id);
}
