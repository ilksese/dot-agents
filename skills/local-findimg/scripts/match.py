#!/usr/bin/env python3
"""dhash 图片匹配：在旧图库中为新图找 top 匹配。

用法:
  python3 match.py <新图目录> <旧图目录> [--calibrate <已知配对新图目录>] [--top N]

--calibrate: 用已知真实配对目录（如图标已迁移组）先输出距离分布作阈值参照。
"""
import argparse
import os
import sys

from PIL import Image

RESAMPLE = getattr(getattr(Image, 'Resampling', Image), 'LANCZOS')

def dhash(path, size=16):
    try:
        im = Image.open(path).convert('RGBA')
    except Exception:
        return None
    b = im.getbbox()
    if b:
        im = im.crop(b)
    if im.width == 0 or im.height == 0:
        return None
    im = Image.alpha_composite(Image.new('RGBA', im.size, (0, 0, 0, 255)), im).convert('L')
    im = im.resize((size + 1, size), RESAMPLE)
    px = list(im.getdata())  # type: ignore[arg-type]
    return [1 if px[r * (size + 1) + c] > px[r * (size + 1) + c + 1] else 0
            for r in range(size) for c in range(size)]

def ham(a, b):
    return sum(x != y for x, y in zip(a, b))

def collect(d):
    out = []
    for root, _, fs in os.walk(d):
        for f in fs:
            if f.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')):
                out.append(os.path.join(root, f))
    return out

def dimensions(path):
    try:
        with Image.open(path) as im:
            return f'{im.width}x{im.height}'
    except Exception:
        return 'unknown'

def top_matches(new_dir, old_vecs, top, single=None, excluded=None):
    for nf in sorted(collect(new_dir)):
        if single and os.path.basename(nf) != single:
            continue
        nv = dhash(nf)
        if nv is None:
            print(f'!! 无法读取 {nf}')
            continue
        scored = sorted(
            (ham(nv, v), p) for p, v in old_vecs
            if not excluded or os.path.realpath(p) != excluded
        )[:top]
        print(f'\n{os.path.relpath(nf)} ({dimensions(nf)}):')
        for h, p in scored:
            print(f'  hamming={h:>3}  {p} ({dimensions(p)})')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('new_dir')
    ap.add_argument('old_dir')
    ap.add_argument('--calibrate', help='已知真实配对的目录，先输出其距离分布')
    ap.add_argument('--top', type=int, default=6)
    args = ap.parse_args()

    if args.top < 1:
        ap.error('--top must be at least 1')
    if not os.path.exists(args.new_dir):
        ap.error(f'new image or directory does not exist: {args.new_dir}')
    if not os.path.isdir(args.old_dir):
        ap.error(f'old image directory does not exist: {args.old_dir}')

    # new_dir 传的是单个文件时，自动落到其父目录，只输出该文件的结果
    single = None
    target_path = args.new_dir
    if os.path.isfile(args.new_dir):
        single = os.path.basename(args.new_dir)
        args.new_dir = os.path.dirname(args.new_dir) or '.'
    excluded = os.path.realpath(target_path) if single else None

    old_vecs = []
    for p in collect(args.old_dir):
        v = dhash(p)
        if v is not None:
            old_vecs.append((p, v))
    print(f'旧图向量数: {len(old_vecs)}', file=sys.stderr)

    if args.calibrate:
        print('=== 校准组（已知真实配对）===')
        top_matches(args.calibrate, old_vecs, 2, single, excluded)
        print('\n=== 待匹配组 ===')

    top_matches(args.new_dir, old_vecs, args.top, single, excluded)

if __name__ == '__main__':
    main()
