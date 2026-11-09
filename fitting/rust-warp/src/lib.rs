use std::alloc::{alloc as std_alloc, dealloc as std_dealloc, Layout};

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::null_mut();
    }
    let layout = Layout::from_size_align(len, 16).unwrap();
    unsafe { std_alloc(layout) }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    let layout = Layout::from_size_align(len, 16).unwrap();
    unsafe { std_dealloc(ptr, layout) }
}

#[inline]
fn color_dist(r1: f32, g1: f32, b1: f32, r2: f32, g2: f32, b2: f32) -> f32 {
    let dr = r1 - r2;
    let dg = g1 - g2;
    let db = b1 - b2;
    (dr * dr + dg * dg + db * db).sqrt()
}

/// Remove studio grey gradient backdrop from RGBA buffer in-place and analyze garment parts & colors.
/// `out_metrics` must hold at least 20 f32 floats:
/// [0..4]: minX, minY, maxX, maxY
/// [4]: spanFrac (bot-top)/h
/// [5]: isSkirt (1.0 if filled center between thighs, 0.0 if split pants/shorts)
/// [6]: hasLongSleeves (1.0 if arms extend past shoulder margin into lower torso)
/// [7]: hasLongBottom (1.0 if garment extends past 0.78*h)
/// [8..11]: upper RGB (0..255)
/// [11..14]: lower RGB (0..255)
/// [14..17]: footwear RGB (0..255)
/// [17..20]: accent/coat RGB (0..255)
#[no_mangle]
pub extern "C" fn extract_garment_rgba(
    rgba_ptr: *mut u8,
    w: usize,
    h: usize,
    keep_accessories: i32,
    out_metrics_ptr: *mut f32,
) -> i32 {
    if rgba_ptr.is_null() || out_metrics_ptr.is_null() || w < 16 || h < 16 {
        return 0;
    }
    let n = w * h;
    let data = unsafe { std::slice::from_raw_parts_mut(rgba_ptr, n * 4) };
    let metrics = unsafe { std::slice::from_raw_parts_mut(out_metrics_ptr, 20) };

    let mut row_bg_r = vec![0.0f32; h];
    let mut row_bg_g = vec![0.0f32; h];
    let mut row_bg_b = vec![0.0f32; h];
    for y in 0..h {
        let l = (y * w + 1) * 4;
        let r = (y * w + (w - 2)) * 4;
        row_bg_r[y] = (data[l] as f32 + data[r] as f32) * 0.5;
        row_bg_g[y] = (data[l + 1] as f32 + data[r + 1] as f32) * 0.5;
        row_bg_b[y] = (data[l + 2] as f32 + data[r + 2] as f32) * 0.5;
    }
    let ref_y = (h * 3) / 10;
    let bg_chroma = row_bg_r[ref_y]
        .max(row_bg_g[ref_y])
        .max(row_bg_b[ref_y])
        - row_bg_r[ref_y]
            .min(row_bg_g[ref_y])
            .min(row_bg_b[ref_y]);
    let max_chroma = 9.0f32.max(bg_chroma + 7.0);

    let is_backdrop = |r: f32, g: f32, b: f32, y: usize, dist_step: f32| -> bool {
        let dist_row = color_dist(r, g, b, row_bg_r[y], row_bg_g[y], row_bg_b[y]);
        let chroma = r.max(g).max(b) - r.min(g).min(b);
        let floor_bonus = if y > (h * 88) / 100 { 22.0 } else { 0.0 };
        (dist_row < 18.0 + floor_bonus && chroma <= max_chroma)
            || (dist_row < 26.0 + floor_bonus && chroma <= max_chroma && dist_step < 8.0)
    };

    let mut is_bg = vec![0u8; n];
    let mut visited = vec![0u8; n];
    let mut queue = Vec::with_capacity(n / 2);

    let try_seed = |x: usize,
                    y: usize,
                    visited: &mut [u8],
                    is_bg: &mut [u8],
                    queue: &mut Vec<usize>| {
        let idx = y * w + x;
        if visited[idx] != 0 {
            return;
        }
        let off = idx * 4;
        if data[off + 3] < 20
            || is_backdrop(
                data[off] as f32,
                data[off + 1] as f32,
                data[off + 2] as f32,
                y,
                0.0,
            )
        {
            visited[idx] = 1;
            is_bg[idx] = 1;
            queue.push(idx);
        }
    };

    for x in 0..w {
        try_seed(x, 0, &mut visited, &mut is_bg, &mut queue);
        try_seed(x, h - 1, &mut visited, &mut is_bg, &mut queue);
    }
    for y in 0..h {
        try_seed(0, y, &mut visited, &mut is_bg, &mut queue);
        try_seed(w - 1, y, &mut visited, &mut is_bg, &mut queue);
    }

    let mut head = 0usize;
    while head < queue.len() {
        let idx = queue[head];
        head += 1;
        let x = idx % w;
        let y = idx / w;
        let off0 = idx * 4;
        let r0 = data[off0] as f32;
        let g0 = data[off0 + 1] as f32;
        let b0 = data[off0 + 2] as f32;

        let nbrs = [
            if x > 0 { Some(idx - 1) } else { None },
            if x + 1 < w { Some(idx + 1) } else { None },
            if y > 0 { Some(idx - w) } else { None },
            if y + 1 < h { Some(idx + w) } else { None },
        ];
        for n_opt in nbrs {
            let Some(n_idx) = n_opt else { continue };
            if visited[n_idx] != 0 {
                continue;
            }
            visited[n_idx] = 1;
            let n_off = n_idx * 4;
            if data[n_off + 3] < 20 {
                is_bg[n_idx] = 1;
                queue.push(n_idx);
                continue;
            }
            let nr = data[n_off] as f32;
            let ng = data[n_off + 1] as f32;
            let nb = data[n_off + 2] as f32;
            let ny = n_idx / w;
            let dist_step = color_dist(nr, ng, nb, r0, g0, b0);
            if is_backdrop(nr, ng, nb, ny, dist_step) {
                is_bg[n_idx] = 1;
                queue.push(n_idx);
            }
        }
    }

    // Clear enclosed neutral-grey backdrop holes inside collar / between arms & waist / legs
    let hole_chroma = 7.0f32.max(bg_chroma + 5.0);
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if is_bg[i] != 0 {
                continue;
            }
            let off = i * 4;
            let r = data[off] as f32;
            let g = data[off + 1] as f32;
            let b = data[off + 2] as f32;
            let chroma = r.max(g).max(b) - r.min(g).min(b);
            let dist = color_dist(r, g, b, row_bg_r[y], row_bg_g[y], row_bg_b[y]);
            if chroma <= hole_chroma && dist < 13.0 {
                is_bg[i] = 1;
            }
        }
    }

    // Apply alpha & soft 1px feathering + color decontamination along border
    for y in 0..h {
        for x in 0..w {
            let idx = y * w + x;
            let off = idx * 4;
            if is_bg[idx] != 0 {
                data[off + 3] = 0;
                continue;
            }
            let mut bg_n = 0;
            if x > 0 && is_bg[idx - 1] != 0 { bg_n += 1; }
            if x + 1 < w && is_bg[idx + 1] != 0 { bg_n += 1; }
            if y > 0 && is_bg[idx - w] != 0 { bg_n += 1; }
            if y + 1 < h && is_bg[idx + w] != 0 { bg_n += 1; }
            if bg_n > 0 {
                let dist = color_dist(
                    data[off] as f32,
                    data[off + 1] as f32,
                    data[off + 2] as f32,
                    row_bg_r[y],
                    row_bg_g[y],
                    row_bg_b[y],
                );
                if dist < 44.0 {
                    let frac = (dist / 44.0).clamp(0.0, 1.0);
                    data[off + 3] = ((data[off + 3] as f32) * frac) as u8;
                }
            }
        }
    }

    // Row bounding spans
    let mut row_left = vec![-1i32; h];
    let mut row_right = vec![-1i32; h];
    let mut row_count = vec![0usize; h];
    for y in 0..h {
        let mut min_x = w as i32;
        let mut max_x = -1i32;
        let mut cnt = 0usize;
        for x in 0..w {
            if data[(y * w + x) * 4 + 3] > 32 {
                let xi = x as i32;
                if xi < min_x { min_x = xi; }
                if xi > max_x { max_x = xi; }
                cnt += 1;
            }
        }
        if max_x >= min_x {
            row_left[y] = min_x;
            row_right[y] = max_x;
            row_count[y] = cnt;
        }
    }

    let gap_thresh = 6usize.max((h * 15) / 1000);
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut cur_start: Option<usize> = None;
    let mut empty_run = 0usize;
    for y in 0..h {
        if row_count[y] > 4 {
            if cur_start.is_none() {
                cur_start = Some(y);
            }
            empty_run = 0;
        } else if let Some(st) = cur_start {
            empty_run += 1;
            if empty_run > gap_thresh {
                spans.push((st, y - empty_run));
                cur_start = None;
            }
        }
    }
    if let Some(st) = cur_start {
        spans.push((st, h - 1 - empty_run.min(h - 1 - st)));
    }

    let (top_y, bot_y) = if spans.is_empty() {
        (0, h - 1)
    } else if keep_accessories == 0 {
        *spans
            .iter()
            .max_by_key(|&&(a, b)| b - a)
            .unwrap()
    } else {
        (spans[0].0, spans[spans.len() - 1].1)
    };

    // Sample shoe color from bottommost span if separate shoes exist, else bottom 10%
    let (shoe_y0, shoe_y1) = if spans.len() >= 2 && spans.last().unwrap().1 > bot_y {
        let last = *spans.last().unwrap();
        (last.0, last.1)
    } else {
        (bot_y.saturating_sub((bot_y - top_y) / 10), bot_y)
    };

    // Zero alpha outside [top_y, bot_y] when keep_accessories == 0 so floating hats/shoes aren't drawn twice
    if keep_accessories == 0 {
        for y in 0..h {
            if y < top_y || y > bot_y {
                for x in 0..w {
                    data[(y * w + x) * 4 + 3] = 0;
                }
            }
        }
    }

    let mut min_x = w as i32;
    let mut max_x = 0i32;
    for y in top_y..=bot_y {
        if row_left[y] >= 0 {
            min_x = min_x.min(row_left[y]);
            max_x = max_x.max(row_right[y]);
        }
    }
    if max_x <= min_x {
        min_x = 0;
        max_x = (w as i32) - 1;
    }

    // Color & garment-type heuristics for 3D Clothing mode
    let span_h = (bot_y - top_y + 1).max(1);
    let sample_avg_rgb = |y0: usize, y1: usize, x0: i32, x1: i32| -> (f32, f32, f32) {
        let mut sr = 0.0f32;
        let mut sg = 0.0f32;
        let mut sb = 0.0f32;
        let mut cnt = 0.0f32;
        for y in y0.clamp(0, h - 1)..=y1.clamp(0, h - 1) {
            for x in x0.max(0)..=x1.min((w as i32) - 1) {
                let off = (y * w + x as usize) * 4;
                if data[off + 3] > 180 {
                    sr += data[off] as f32;
                    sg += data[off + 1] as f32;
                    sb += data[off + 2] as f32;
                    cnt += 1.0;
                }
            }
        }
        if cnt < 1.0 {
            (225.0, 222.0, 218.0)
        } else {
            (sr / cnt, sg / cnt, sb / cnt)
        }
    };

    let mid_x = (min_x + max_x) / 2;
    let core_half = ((max_x - min_x) / 5).max(8);
    let (up_r, up_g, up_b) = sample_avg_rgb(
        top_y + span_h / 8,
        top_y + span_h / 3,
        mid_x - core_half,
        mid_x + core_half,
    );
    let (low_r, low_g, low_b) = sample_avg_rgb(
        top_y + (span_h * 45) / 100,
        top_y + (span_h * 68) / 100,
        mid_x - core_half,
        mid_x + core_half,
    );
    let (acc_r, acc_g, acc_b) = sample_avg_rgb(
        top_y + span_h / 5,
        top_y + span_h / 2,
        min_x,
        min_x + ((max_x - min_x) / 4).max(4),
    );
    // For shoe color, sample directly from original pre-zeroed data? Wait: if keep_accessories == 0, we zeroed outside bot_y.
    // Sample from [bot_y - span_h/10 .. bot_y] which already captures boots/socks if connected, or default light neutral.
    let (sh_r, sh_g, sh_b) = if shoe_y1 <= bot_y {
        sample_avg_rgb(shoe_y0, shoe_y1, min_x, max_x)
    } else {
        (235.0, 232.0, 228.0)
    };

    // Detect skirt vs trousers by checking center column occupancy at hip/thigh band (42..56% height)
    let mut center_filled = 0usize;
    let mut center_total = 0usize;
    let cy0 = top_y + (span_h * 42) / 100;
    let cy1 = top_y + (span_h * 56) / 100;
    for y in cy0.min(bot_y)..=cy1.min(bot_y) {
        for dx in -4i32..=4i32 {
            let x = (mid_x + dx).clamp(0, (w as i32) - 1) as usize;
            center_total += 1;
            if data[(y * w + x) * 4 + 3] > 60 {
                center_filled += 1;
            }
        }
    }
    let is_skirt = if center_total > 0 && (center_filled as f32) / (center_total as f32) > 0.48 {
        1.0
    } else {
        0.0
    };

    // Detect long sleeves by checking lateral pixel density at waist height
    let wy0 = top_y + (span_h * 34) / 100;
    let wy1 = top_y + (span_h * 45) / 100;
    let mut wide_rows = 0usize;
    let shoulder_w = {
        let sy = (top_y + (span_h * 14) / 100).min(bot_y);
        if row_right[sy] > row_left[sy] {
            (row_right[sy] - row_left[sy]) as f32
        } else {
            (max_x - min_x) as f32
        }
    };
    for y in wy0.min(bot_y)..=wy1.min(bot_y) {
        if row_right[y] > row_left[y] && ((row_right[y] - row_left[y]) as f32) > shoulder_w * 0.72 {
            wide_rows += 1;
        }
    }
    let has_long_sleeves = if wide_rows >= (wy1.saturating_sub(wy0)) / 2 { 1.0 } else { 0.0 };
    let has_long_bottom = if (bot_y as f32) / (h as f32) > 0.78 { 1.0 } else { 0.0 };

    metrics[0] = min_x as f32;
    metrics[1] = top_y as f32;
    metrics[2] = max_x as f32;
    metrics[3] = bot_y as f32;
    metrics[4] = (span_h as f32) / (h as f32);
    metrics[5] = is_skirt;
    metrics[6] = has_long_sleeves;
    metrics[7] = has_long_bottom;
    metrics[8] = up_r;
    metrics[9] = up_g;
    metrics[10] = up_b;
    metrics[11] = low_r;
    metrics[12] = low_g;
    metrics[13] = low_b;
    metrics[14] = sh_r;
    metrics[15] = sh_g;
    metrics[16] = sh_b;
    metrics[17] = acc_r;
    metrics[18] = acc_g;
    metrics[19] = acc_b;
    1
}

/// Similarity Moving Least Squares (Schaefer et al. 2006) warp evaluated on a 6px grid and
/// bilinearly interpolated per pixel with bilinear RGBA sampling.
#[no_mangle]
pub extern "C" fn mls_warp_rgba(
    src_ptr: *const u8,
    sw: usize,
    sh: usize,
    dst_ptr: *mut u8,
    dw: usize,
    dh: usize,
    src_pts_ptr: *const f32,
    dst_pts_ptr: *const f32,
    n_pts: usize,
    roi_x0: i32,
    roi_y0: i32,
    roi_x1: i32,
    roi_y1: i32,
) {
    if src_ptr.is_null() || dst_ptr.is_null() || src_pts_ptr.is_null() || dst_pts_ptr.is_null() || n_pts < 3 {
        return;
    }
    let src = unsafe { std::slice::from_raw_parts(src_ptr, sw * sh * 4) };
    let dst = unsafe { std::slice::from_raw_parts_mut(dst_ptr, dw * dh * 4) };
    let p_pts = unsafe { std::slice::from_raw_parts(src_pts_ptr, n_pts * 2) };
    let q_pts = unsafe { std::slice::from_raw_parts(dst_pts_ptr, n_pts * 2) };

    let x0 = roi_x0.max(0) as usize;
    let y0 = roi_y0.max(0) as usize;
    let x1 = (roi_x1.min(dw as i32 - 1)).max(0) as usize;
    let y1 = (roi_y1.min(dh as i32 - 1)).max(0) as usize;
    if x1 <= x0 || y1 <= y0 {
        return;
    }

    // Evaluate inverse MLS q -> p at stride 6px
    const STEP: usize = 6;
    let gw = (x1 - x0 + STEP - 1) / STEP + 2;
    let gh = (y1 - y0 + STEP - 1) / STEP + 2;
    let mut map_x = vec![0.0f32; gw * gh];
    let mut map_y = vec![0.0f32; gw * gh];
    let mut weights = vec![0.0f32; n_pts];

    for gy in 0..gh {
        let vy = (y0 + gy * STEP) as f32;
        for gx in 0..gw {
            let vx = (x0 + gx * STEP) as f32;
            let mut w_sum = 0.0f32;
            let mut qx_avg = 0.0f32;
            let mut qy_avg = 0.0f32;
            let mut px_avg = 0.0f32;
            let mut py_avg = 0.0f32;

            for i in 0..n_pts {
                let qx = q_pts[i * 2];
                let qy = q_pts[i * 2 + 1];
                let d2 = (vx - qx) * (vx - qx) + (vy - qy) * (vy - qy);
                let wi = 1.0 / (d2 + 18.0);
                weights[i] = wi;
                w_sum += wi;
                qx_avg += wi * qx;
                qy_avg += wi * qy;
                px_avg += wi * p_pts[i * 2];
                py_avg += wi * p_pts[i * 2 + 1];
            }
            qx_avg /= w_sum;
            qy_avg /= w_sum;
            px_avg /= w_sum;
            py_avg /= w_sum;

            let mut mu = 0.0f32;
            let mut a = 0.0f32;
            let mut b = 0.0f32;
            let dvx = vx - qx_avg;
            let dvy = vy - qy_avg;

            for i in 0..n_pts {
                let wi = weights[i];
                let qhx = q_pts[i * 2] - qx_avg;
                let qhy = q_pts[i * 2 + 1] - qy_avg;
                let phx = p_pts[i * 2] - px_avg;
                let phy = p_pts[i * 2 + 1] - py_avg;
                mu += wi * (qhx * qhx + qhy * qhy);
                // Similarity M_s inverse mapping: f(v) = sum w_i * [...] / mu + p*
                a += wi * (qhx * phx + qhy * phy);
                b += wi * (qhx * phy - qhy * phx);
            }
            let norm = mu.max(1e-4);
            let rx = (a * dvx - b * dvy) / norm + px_avg;
            let ry = (b * dvx + a * dvy) / norm + py_avg;
            map_x[gy * gw + gx] = rx;
            map_y[gy * gw + gx] = ry;
        }
    }

    let swf = (sw - 1) as f32;
    let shf = (sh - 1) as f32;

    for y in y0..=y1 {
        let gy_f = ((y - y0) as f32) / (STEP as f32);
        let gy0 = (gy_f as usize).min(gh - 2);
        let ty = gy_f - (gy0 as f32);

        for x in x0..=x1 {
            let gx_f = ((x - x0) as f32) / (STEP as f32);
            let gx0 = (gx_f as usize).min(gw - 2);
            let tx = gx_f - (gx0 as f32);

            let i00 = gy0 * gw + gx0;
            let i10 = i00 + 1;
            let i01 = i00 + gw;
            let i11 = i01 + 1;

            let sx = (map_x[i00] * (1.0 - tx) + map_x[i10] * tx) * (1.0 - ty)
                + (map_x[i01] * (1.0 - tx) + map_x[i11] * tx) * ty;
            let sy = (map_y[i00] * (1.0 - tx) + map_y[i10] * tx) * (1.0 - ty)
                + (map_y[i01] * (1.0 - tx) + map_y[i11] * tx) * ty;

            if sx < 0.0 || sx >= swf || sy < 0.0 || sy >= shf {
                continue;
            }
            let sx0 = sx as usize;
            let sy0 = sy as usize;
            let fx = sx - (sx0 as f32);
            let fy = sy - (sy0 as f32);

            let p00 = (sy0 * sw + sx0) * 4;
            let p10 = p00 + 4;
            let p01 = p00 + sw * 4;
            let p11 = p01 + 4;

            let w00 = (1.0 - fx) * (1.0 - fy);
            let w10 = fx * (1.0 - fy);
            let w01 = (1.0 - fx) * fy;
            let w11 = fx * fy;

            let sa = src[p00 + 3] as f32 * w00
                + src[p10 + 3] as f32 * w10
                + src[p01 + 3] as f32 * w01
                + src[p11 + 3] as f32 * w11;
            if sa < 6.0 {
                continue;
            }

            let sr = src[p00] as f32 * w00
                + src[p10] as f32 * w10
                + src[p01] as f32 * w01
                + src[p11] as f32 * w11;
            let sg = src[p00 + 1] as f32 * w00
                + src[p10 + 1] as f32 * w10
                + src[p01 + 1] as f32 * w01
                + src[p11 + 1] as f32 * w11;
            let sb = src[p00 + 2] as f32 * w00
                + src[p10 + 2] as f32 * w10
                + src[p01 + 2] as f32 * w01
                + src[p11 + 2] as f32 * w11;

            let dst_off = (y * dw + x) * 4;
            let alpha = (sa / 255.0).clamp(0.0, 1.0);
            let inv = 1.0 - alpha;
            dst[dst_off] = (sr * alpha + dst[dst_off] as f32 * inv).clamp(0.0, 255.0) as u8;
            dst[dst_off + 1] = (sg * alpha + dst[dst_off + 1] as f32 * inv).clamp(0.0, 255.0) as u8;
            dst[dst_off + 2] = (sb * alpha + dst[dst_off + 2] as f32 * inv).clamp(0.0, 255.0) as u8;
            dst[dst_off + 3] = 255;
        }
    }
}

/// Harmonize head cutout edge tone with neck skin color & soften bottom jaw merge.
#[no_mangle]
pub extern "C" fn blend_head_rgba(
    rgba_ptr: *mut u8,
    hw: usize,
    hh: usize,
    target_r: f32,
    target_g: f32,
    target_b: f32,
    chin_y_norm: f32,
) {
    if rgba_ptr.is_null() || hw < 4 || hh < 4 {
        return;
    }
    let data = unsafe { std::slice::from_raw_parts_mut(rgba_ptr, hw * hh * 4) };
    let chin_y = (chin_y_norm.clamp(0.5, 0.98)) * (hh as f32);

    for y in 0..hh {
        let yf = y as f32;
        let jaw_t = ((yf - (chin_y - (hh as f32) * 0.08)) / ((hh as f32) * 0.12)).clamp(0.0, 1.0);
        for x in 0..hw {
            let off = (y * hw + x) * 4;
            let a = data[off + 3];
            if a == 0 {
                continue;
            }
            let r = data[off] as f32;
            let g = data[off + 1] as f32;
            let b = data[off + 2] as f32;
            // Detect skin-like pixels (r >= g >= b) and gently pull bright halo/jaw toward body neck color
            if r >= g - 4.0 && g >= b - 4.0 && a < 245 {
                let mix = (0.35 + jaw_t * 0.35) * (1.0 - (a as f32 / 255.0) * 0.5);
                data[off] = (r * (1.0 - mix) + target_r * mix).clamp(0.0, 255.0) as u8;
                data[off + 1] = (g * (1.0 - mix) + target_g * mix).clamp(0.0, 255.0) as u8;
                data[off + 2] = (b * (1.0 - mix) + target_b * mix).clamp(0.0, 255.0) as u8;
            }
            if yf > chin_y && a < 220 {
                let fade = (1.0 - (yf - chin_y) / ((hh as f32 - chin_y).max(2.0))).clamp(0.0, 1.0);
                data[off + 3] = ((a as f32) * fade) as u8;
            }
        }
    }
}
