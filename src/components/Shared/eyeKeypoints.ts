import type { ImageEyeKeypoints } from '../../../electron/types';

/** True when the keypoints carry a usable display size and at least one eye to draw. */
export function hasDrawableEyes(eyes: ImageEyeKeypoints | null | undefined): eyes is ImageEyeKeypoints {
    return !!eyes && eyes.display_width > 0 && eyes.display_height > 0 && eyes.points.length > 0;
}
