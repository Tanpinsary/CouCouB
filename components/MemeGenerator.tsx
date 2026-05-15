"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { HOMOPHONE_THEMES, type HomophoneTheme } from "@/data/homophoneLexicons";
import { generateHomophoneCandidates, type HomophoneCandidate } from "@/lib/homophoneGenerator";
import { loadHomophoneLexicon } from "@/lib/homophoneLexiconLoader";

// ─── Types ───────────────────────────────────────────────────────────────────

type Style = 2 | 3 | 4 | "环形多头";
type ImageKey = keyof Imgs;

interface Imgs {
  left: HTMLImageElement;
  right: HTMLImageElement;
  middle: HTMLImageElement;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
const PAD = 14;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MIDDLE_IMAGE_SCALE = 1.18;
const STYLE4_MIDDLE_EXTRA_SCALE = 1.2;

const CANVAS_SIZE: Record<Style, [number, number]> = {
  2: [900, 400],
  3: [1080, 700],
  4: [1200, 640],
  "环形多头": [900, 1000],
};

const DEFAULT_TEXTS: Record<Style, string[]> = {
  2: ["原神牛逼", "鸣潮牛逼", "！？逼逼？！"],
  3: ["Gemini 牛逼", "Kimi 牛逼", "Deepseek 牛逼", "！？NKD？！"],
  4: ["Blender 牛逼", "Unity3D 牛逼", "Python 牛逼", "TypeScript 牛逼", "！？BUPT？！"],
  "环形多头": [],
};

const STYLE_2_ORDER: ImageKey[] = ["right", "left", "middle"];
const STYLE_4_HEAD_ORDER: ImageKey[] = ["right", "left", "right", "left"];
const RING_HEAD_ORDER: ImageKey[] = ["right", "left"];

function getOrderedImages(imgs: Imgs, order: ImageKey[]): HTMLImageElement[] {
  return order.map(key => imgs[key]);
}

function getPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO));
}

const INPUT_LABELS: Record<Style, string[]> = {
  2: ["文案 1", "文案 2", "！？？！"],
  3: ["文案 1", "文案 2", "文案 3", "！？？！"],
  4: ["文案 1", "文案 2", "文案 3", "文案 4", "！？？！"],
  "环形多头": [],
};

// 生成环形模式的输入标签
function getRingLabels(count: number): string[] {
  const labels = [];
  for (let i = 0; i < count; i++) {
    labels.push(`文案 ${i + 1}`);
  }
  labels.push("！？？！");
  return labels;
}

// ─── Canvas Helpers ──────────────────────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  initialSize: number
): number {
  if (!text.trim()) return 0;

  // Auto-shrink logic: reduce font size until text fits or hits minimum size
  let size = initialSize;
  const minSize = 12; // Don't go smaller than this
  
  ctx.font = `bold ${size}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && size > minSize) {
    size -= 1;
    ctx.font = `bold ${size}px ${FONT}`;
  }

  // Common settings
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Even after shrinking, if it's still too wide (at minSize), we wrap it.
  const chars = [...text];
  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lh = size * 1.45;
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
  return lines.length * lh;
}

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, y: number, len = 30): void {
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, y + len - 9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 7, y + len - 9);
  ctx.lineTo(cx + 7, y + len - 9);
  ctx.lineTo(cx, y + len);
  ctx.closePath();
  ctx.fill();
}

function drawImg(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  alignBottom: boolean = false
): void {
  if (!img.complete || img.naturalWidth === 0) return;
  const r = img.naturalWidth / img.naturalHeight;
  const br = w / h;
  let dw: number, dh: number, dx: number, dy: number;
  if (r > br) {
    dw = w; dh = w / r; dx = x; dy = y + (h - dh) / 2;
  } else {
    dh = h; dw = h * r; dx = x + (w - dw) / 2; dy = y;
  }
  
  if (alignBottom) {
    dy = y + h - dh;
  }
  
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawMiddleImg(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  alignBottom: boolean = false,
  extraScale: number = 1
): void {
  const scale = MIDDLE_IMAGE_SCALE * extraScale;
  const scaledW = w * scale;
  const scaledH = h * scale;
  drawImg(
    ctx,
    img,
    x - (scaledW - w) / 2,
    y - (scaledH - h) / 2,
    scaledW,
    scaledH,
    alignBottom
  );
}

// ─── Style Drawing Functions ─────────────────────────────────────────────────

/**
 * Style 2: [Right | Left | Middle]
 * Classic "yelling woman" style but with 3 horizontal panels.
 */
function drawStyle2(ctx: CanvasRenderingContext2D, w: number, h: number, imgs: Imgs, texts: string[]) {
  const colW = w / 3;
  const textH = 60;
  const arrowH = 26;
  const imgPad = 24;
  const imgY = textH + arrowH;
  const imgH = h - imgY - imgPad * 0.75;

  getOrderedImages(imgs, STYLE_2_ORDER).forEach((img, i) => {
    const cx = colW * i + colW / 2;
    const txt = texts[i] || DEFAULT_TEXTS[2][i];
    wrapText(ctx, txt, cx, 12, colW - PAD * 2, 30);
    drawArrow(ctx, cx, textH + 2, 20);
    const draw = img === imgs.middle ? drawMiddleImg : drawImg;
    draw(ctx, img, colW * i + imgPad, imgY, colW - imgPad * 2, imgH, true);
  });
}

/**
 * Style 3: [Left (30%) | Mid (30%) | Right (40%)]
 * Left: Two stacked "Right" profiles
 * Mid: One centered "Left" profile
 * Right: One punchline "Middle" face
 */
function drawStyle3(ctx: CanvasRenderingContext2D, w: number, h: number, imgs: Imgs, texts: string[]) {
  const lW = w * 0.36;
  const mW = w * 0.24;
  const rW = w * 0.4;

  const cellH = h / 2;
  const sTxt = 40, sArrow = 20;
  const sImgH = cellH - sTxt - sArrow + 10;

  // Left column: 2 stacked cells
  for (let i = 0; i < 2; i++) {
    const y0 = i * cellH;
    const cx = lW / 2;
    const txt = texts[i] || DEFAULT_TEXTS[3][i];
    wrapText(ctx, txt, cx, y0 + 15, lW - PAD * 2, 30);
    drawArrow(ctx, cx, y0 + sTxt + 10, 20);
    drawImg(ctx, imgs.right, PAD, y0 + sTxt + sArrow + 10, lW - PAD * 2, sImgH - 50, true);
  }

  // Mid column: Centered "Left"
  const mTxt = 40, mArrow = 20, mX = lW;
  const mCx = mX + mW / 2;
  const mImgH = sImgH;
  const mImgY = (h - mImgH) / 2;

  const mText = texts[2] || DEFAULT_TEXTS[3][2];
  wrapText(ctx, mText, mCx, mImgY - mArrow - mTxt, mW - PAD * 2, 40);
  drawArrow(ctx, mCx, mImgY - mArrow, 20);
  drawImg(ctx, imgs.left, mX + PAD, mImgY, mW - PAD * 2, mImgH - 30, true);

  // Right column: Punchline
  const rX = lW + mW, rCx = rX + rW / 2;
  const rTxt = 120, rArrow = 36;
  const rImgH = Math.min(h - rTxt - rArrow - 6, 280);

  const rText = texts[3] || DEFAULT_TEXTS[3][3];
  wrapText(ctx, rText, rCx, 150, rW - PAD * 2, 40);
  drawArrow(ctx, rCx, rTxt + 80, 30);
  const rImgY = rTxt + rArrow + (h - rTxt - rArrow - rImgH) / 2 - 20;
  drawMiddleImg(ctx, imgs.middle, rX + PAD, rImgY - 30, rW - PAD * 2, rImgH - 20, false);
}

/**
 * Style 4:
 * Top: 4 equal columns [Left x 4]
 * Bottom: 1 wide punchline [Middle]
 */
function drawStyle4(ctx: CanvasRenderingContext2D, w: number, h: number, imgs: Imgs, texts: string[]) {
  const topH = Math.round(h * 0.53);
  const colW = w / 4;
  const tTxt = 58; 
  const tArrow = 24;
  const tImgH = topH - tTxt - tArrow - 4;

  const headImgs = getOrderedImages(imgs, STYLE_4_HEAD_ORDER);
  for (let i = 0; i < 4; i++) {
    const cx = colW * i + colW / 2;
    const txt = texts[i] || DEFAULT_TEXTS[4][i];
    wrapText(ctx, txt, cx, 10, colW - PAD, 30);
    drawArrow(ctx, cx, tTxt + 2, 20);
    drawImg(ctx, headImgs[i], colW * i + PAD, tTxt + tArrow + 4, colW - PAD * 2, tImgH, true);
  }

  // Punchline
  const pW = 380, pX = (w - pW) / 2, pCx = w / 2;
  const pY = topH;
  const pTxt = 68;
  const pArrow = 24;
  const pImgH = h - pY - pTxt - pArrow - 6;
  
  const pText = texts[4] || DEFAULT_TEXTS[4][4];
  wrapText(ctx, pText, pCx, pY + 20, pW - PAD, 40);
  drawArrow(ctx, pCx, pY + pTxt + 2, 20);
  drawMiddleImg(ctx, imgs.middle, pX, pY + pTxt + pArrow + 4, pW, pImgH, true, STYLE4_MIDDLE_EXTRA_SCALE);
}

/**
 * 环形多头模式:
 * 外圈: left 和 right 图片交替排列，带旋转
 * 中心: middle 图片 + 最后一个文本
 */
function drawStyleRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  imgs: Imgs,
  texts: string[],
  headCount: number
) {
  const cx = w / 2;
  const cy = h / 2;
  const safeHeadCount = Math.max(3, headCount);
  const minDimension = Math.min(w, h);
  const angleStep = (Math.PI * 2) / safeHeadCount;
  const maxOuterRadius = minDimension * 0.46;
  const radius = minDimension * (safeHeadCount <= 4 ? 0.28 : safeHeadCount <= 8 ? 0.31 : 0.34);
  const chord = 2 * radius * Math.sin(angleStep / 2);
  const imgSize = Math.max(88, Math.min(190, chord * 0.72, radius * 0.58));
  const textOffset = Math.max(54, Math.min(96, imgSize * 0.45 + 28));
  const textRadius = Math.min(maxOuterRadius, radius + textOffset);
  const maxTextWidth = Math.max(72, Math.min(imgSize * 1.25, chord * 0.68));
  const ringImages = getOrderedImages(imgs, RING_HEAD_ORDER);

  // 绘制外圈的头像和文字
  for (let i = 0; i < safeHeadCount; i++) {
    const angle = i * angleStep - Math.PI / 2; // 从顶部开始
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    const img = ringImages[i % ringImages.length];

    // 保存上下文状态
    ctx.save();
    ctx.translate(x, y);
    
    // 计算旋转角度：让头像朝向中心
    const rotationAngle = angle + Math.PI / 2;
    ctx.rotate(rotationAngle);

    // 绘制图像（以当前点为中心）
    drawImg(ctx, img, -imgSize / 2, -imgSize / 2, imgSize, imgSize, false);

    ctx.restore();

    // 绘制文字（在图像外侧）
    const textX = cx + Math.cos(angle) * textRadius;
    const textY = cy + Math.sin(angle) * textRadius;

    ctx.save();
    ctx.translate(textX, textY);
    
    // 文字旋转，使其可读（底部的文字需要翻转）
    let textRotation = angle + Math.PI / 2;
    if (angle > 0 && angle < Math.PI) {
      textRotation += Math.PI;
    }
    ctx.rotate(textRotation);

    // 绘制文字
    const txt = texts[i] || "";
    
    // 使用 wrapText 自动处理字号缩小和换行
    // 预估高度约为 40px，所以在 -20px 处开始绘制以大致垂直居中
    const initialTextSize = safeHeadCount > 10 ? 18 : safeHeadCount > 8 ? 20 : 24;
    wrapText(ctx, txt, 0, -initialTextSize * 0.8, maxTextWidth, initialTextSize);

    ctx.restore();

    // 绘制箭头（从文字指向图像）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);

    const arrowDistStart = textRadius - Math.max(16, initialTextSize * 0.75);
    const arrowDistEnd = radius + imgSize / 2 + 10;
    const arrowLen = Math.max(20, arrowDistStart - arrowDistEnd);

    drawArrow(ctx, 0, -arrowDistStart, arrowLen);

    ctx.restore();
  }

  // 绘制中心的 middle 图片
  const centerImgSize = Math.min(imgSize * 1.45, radius * 0.9);
  drawMiddleImg(ctx, imgs.middle, cx - centerImgSize / 2, cy - centerImgSize / 2, centerImgSize, centerImgSize, false);

  // 绘制中心文字（最后一个文本，在 middle 图片上方）
  const centerText = texts[safeHeadCount] || "";
  if (centerText) {
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    wrapText(ctx, centerText, cx, cy - centerImgSize / 2 - 30, centerImgSize * 2, 40);
  }
}

function drawMeme(
  ctx: CanvasRenderingContext2D,
  style: Style,
  width: number,
  height: number,
  imgs: Imgs,
  texts: string[],
  ringCount: number
): void {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  if (style === 2) drawStyle2(ctx, width, height, imgs, texts);
  else if (style === 3) drawStyle3(ctx, width, height, imgs, texts);
  else if (style === 4) drawStyle4(ctx, width, height, imgs, texts);
  else if (style === "环形多头") drawStyleRing(ctx, width, height, imgs, texts, ringCount);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MemeGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgsRef = useRef<Imgs | null>(null);
  const exportUrlRef = useRef<string | null>(null);
  const generatorRequestRef = useRef(0);
  const [style, setStyle] = useState<Style>(2);
  const [texts, setTexts] = useState<string[]>(new Array(DEFAULT_TEXTS[2].length).fill(""));
  const [ready, setReady] = useState(false);
  const [ringCount, setRingCount] = useState(6); // 环形模式的头数量
  const [generatorInput, setGeneratorInput] = useState("");
  const [generatorTheme, setGeneratorTheme] = useState<HomophoneTheme>("ACGN");
  const [fuzzyMatching, setFuzzyMatching] = useState(true);
  const [candidates, setCandidates] = useState<HomophoneCandidate[]>([]);
  const [selectedCandidateOptions, setSelectedCandidateOptions] = useState<Record<number, string[]>>({});
  const [generatorMessage, setGeneratorMessage] = useState("请输入结果文案");
  const [isGenerating, setIsGenerating] = useState(false);

  const resetGeneratorState = (message: string) => {
    generatorRequestRef.current += 1;
    setCandidates([]);
    setSelectedCandidateOptions({});
    setGeneratorMessage(message);
    setIsGenerating(false);
  };

  // Load images once
  useEffect(() => {
    let loaded = 0;
    const left = new Image(), right = new Image(), middle = new Image();
    left.crossOrigin = right.crossOrigin = middle.crossOrigin = "anonymous";
    const onLoad = () => {
      loaded++;
      if (loaded === 3) {
        imgsRef.current = { left, right, middle };
        setReady(true);
      }
    };
    left.onload = right.onload = middle.onload = onLoad;
    left.src = "/Left.png";
    right.src = "/Right.png";
    middle.src = "/Middle.png";
  }, []);

  useEffect(() => {
    return () => {
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
      }
    };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const imgs = imgsRef.current;
    if (!canvas || !imgs) return;
    const [logicalWidth, logicalHeight] = CANVAS_SIZE[style];
    const pixelRatio = getPixelRatio();
    const backingWidth = Math.round(logicalWidth * pixelRatio);
    const backingHeight = Math.round(logicalHeight * pixelRatio);

    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    canvas.style.width = "";
    canvas.style.height = "";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawMeme(ctx, style, logicalWidth, logicalHeight, imgs, texts, ringCount);
  }, [style, texts, ringCount]);

  useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  // When style changes, reset texts
  const changeStyle = (s: Style) => {
    setStyle(s);
    resetGeneratorState(generatorInput.trim() ? "点击生成候选" : "请输入结果文案");
    if (s === "环形多头") {
      setTexts(new Array(ringCount + 1).fill("")); // ringCount 个外圈 + 1 个中心
    } else {
      setTexts(new Array(DEFAULT_TEXTS[s].length).fill(""));
    }
  };

  // 更新环形模式的头数量
  const updateRingCount = (count: number) => {
    const newCount = Math.max(3, count); // 最少3个
    resetGeneratorState(generatorInput.trim() ? "点击生成候选" : "请输入结果文案");
    
    if (style === "环形多头") {
      setTexts(prev => {
        const prevCount = prev.length - 1; // 之前的头数 = 数组长度 - 1
        const next = new Array(newCount + 1).fill("");
        
        // 1. 搬运普通文案 (0 到 min(prevCount, newCount) - 1)
        const commonCount = Math.min(prevCount, newCount);
        for (let i = 0; i < commonCount; i++) {
          next[i] = prev[i];
        }
        
        // 2. 搬运中心文案 (prev 的最后一个 -> next 的最后一个)
        if (prev.length > 0) {
          next[newCount] = prev[prevCount];
        }
        
        return next;
      });
    }
    setRingCount(newCount);
  };

  const updateText = (i: number, val: string) => {
    setTexts(prev => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  };

  const applySelectedCandidateOptions = (
    slotCount: number,
    slotCandidates: HomophoneCandidate[],
    selections: Record<number, string[]>
  ) => {
    setTexts(prev => {
      const next = new Array(slotCount).fill("") as string[];
      for (let i = 0; i < slotCount; i++) {
        next[i] = prev[i] ?? "";
      }

      slotCandidates.forEach(candidate => {
        if (candidate.slotIndex < 0 || candidate.slotIndex >= slotCount) return;
        const selectedIds = new Set(selections[candidate.slotIndex] ?? []);
        const selectedTexts = candidate.options
          .filter(option => selectedIds.has(option.id))
          .map(option => option.text);
        next[candidate.slotIndex] = selectedTexts.join(" + ");
      });

      return next;
    });
  };

  const toggleCandidateOption = (candidate: HomophoneCandidate, optionId: string, checked: boolean) => {
    if (candidate.slotIndex >= labels.length) {
      resetGeneratorState("候选已过期，请重新生成");
      return;
    }

    setSelectedCandidateOptions(prev => {
      const currentIds = prev[candidate.slotIndex] ?? [];
      const nextIds = checked
        ? [...currentIds, optionId].filter((id, index, ids) => ids.indexOf(id) === index)
        : currentIds.filter(id => id !== optionId);
      const nextSelections = { ...prev, [candidate.slotIndex]: nextIds };
      applySelectedCandidateOptions(labels.length, candidates, nextSelections);
      return nextSelections;
    });
  };

  const generateCandidates = async () => {
    const requestId = generatorRequestRef.current + 1;
    generatorRequestRef.current = requestId;
    const activeLabels = style === "环形多头" ? getRingLabels(ringCount) : INPUT_LABELS[style];
    const input = generatorInput.trim();
    if (!input) {
      setCandidates([]);
      setGeneratorMessage("请输入结果文案");
      return;
    }

    setIsGenerating(true);
    setCandidates([]);
    setSelectedCandidateOptions({});
    setGeneratorMessage("加载词库中…");

    try {
      const entries = await loadHomophoneLexicon(generatorTheme);
      const nextCandidates = generateHomophoneCandidates({
        input,
        theme: generatorTheme,
        entries,
        fuzzy: fuzzyMatching,
        slotCount: activeLabels.length,
      });

      if (generatorRequestRef.current !== requestId) return;
      const finalCandidate = nextCandidates.find(candidate => candidate.slotIndex === activeLabels.length - 1);
      const nextSelections: Record<number, string[]> = finalCandidate
        ? { [finalCandidate.slotIndex]: finalCandidate.options.map(option => option.id) }
        : {};
      setCandidates(nextCandidates);
      setSelectedCandidateOptions(nextSelections);
      applySelectedCandidateOptions(activeLabels.length, nextCandidates, nextSelections);
      const selectableSlotCount = nextCandidates.filter(candidate => candidate.options.some(option => !option.readonly)).length;
      setGeneratorMessage(selectableSlotCount > 0 ? `找到 ${selectableSlotCount} 个文案槽候选` : "没有找到前置候选，已保留原文槽");
    } catch (error) {
      if (generatorRequestRef.current !== requestId) return;
      setCandidates([]);
      setSelectedCandidateOptions({});
      const message = error instanceof Error ? error.message : "未知错误";
      setGeneratorMessage(`词库加载失败：${message}`);
    } finally {
      if (generatorRequestRef.current === requestId) setIsGenerating(false);
    }
  };

  const exportPng = () => {
    const imgs = imgsRef.current;
    if (!imgs) return;

    const [logicalWidth, logicalHeight] = CANVAS_SIZE[style];
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = logicalWidth;
    exportCanvas.height = logicalHeight;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";
    drawMeme(exportCtx, style, logicalWidth, logicalHeight, imgs, texts, ringCount);

    exportCanvas.toBlob(blob => {
      if (!blob) return;
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      exportUrlRef.current = url;
      const link = document.createElement("a");
      link.download = "coucou-meme.png";
      link.href = url;
      link.click();

      window.setTimeout(() => {
        if (exportUrlRef.current === url) {
          URL.revokeObjectURL(url);
          exportUrlRef.current = null;
        }
      }, 0);
    }, "image/png");
  };

  const [cw, ch] = CANVAS_SIZE[style];
  const labels = style === "环形多头" ? getRingLabels(ringCount) : INPUT_LABELS[style];

  return (
    <div style={styles.page}>
      <main style={styles.main}>
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.title}>凑凑！？逼？！</h1>
          <p style={styles.subtitle}>籽岷梗图生成器</p>
        </header>

        {/* Card */}
        <div style={styles.card}>
          {/* Style selector */}
          <section style={styles.section}>
            <span style={styles.sectionTitle}>模式</span>
            <div style={styles.segmentedControl}>
              {([2, 3, 4] as Style[]).map(s => (
                <button
                  key={s}
                  onClick={() => changeStyle(s)}
                  style={{
                    ...styles.segment,
                    ...(style === s ? styles.segmentActive : {}),
                  }}
                >
                  {s} 头
                </button>
              ))}
              <button
                onClick={() => changeStyle("环形多头")}
                style={{
                  ...styles.segment,
                  ...(style === "环形多头" ? styles.segmentActive : {}),
                }}
              >
                环形多头
              </button>
            </div>
          </section>

          {/* Ring count input (only for 环形多头 mode) */}
          {style === "环形多头" && (
            <section style={styles.section}>
              <span style={styles.sectionTitle}>外圈头数</span>
              <div style={styles.ringCountWrap}>
                <input
                  type="number"
                  min={3}
                  value={ringCount}
                  onChange={e => updateRingCount(parseInt(e.target.value) || 3)}
                  style={styles.ringCountInput}
                />
                <span style={styles.ringCountHint}>（最少 3 个）</span>
              </div>
            </section>
          )}

          {/* Homophone generator */}
          <section style={styles.section}>
            <div style={styles.generatorHeader}>
              <span style={styles.sectionTitle}>谐音梗自动生成</span>
              <span style={styles.generatorHint}>生成内容会填入前置槽，原文保留到最后槽</span>
            </div>
            <div style={styles.generatorPanel}>
              <div style={styles.generatorControls}>
                <div style={styles.generatorInputGroup}>
                  <label style={styles.inputLabel}>结果文案</label>
                  <input
                    style={styles.input}
                    value={generatorInput}
                    onChange={e => {
                      const nextInput = e.target.value;
                      setGeneratorInput(nextInput);
                      resetGeneratorState(nextInput.trim() ? "点击生成候选" : "请输入结果文案");
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !isGenerating) void generateCandidates();
                    }}
                    placeholder="例如：有点编程语言"
                  />
                </div>
                <div style={styles.generatorSelectGroup}>
                  <label style={styles.inputLabel}>主题</label>
                  <select
                    style={styles.select}
                    value={generatorTheme}
                    onChange={e => {
                      setGeneratorTheme(e.target.value as HomophoneTheme);
                      resetGeneratorState(generatorInput.trim() ? "点击生成候选" : "请输入结果文案");
                    }}
                  >
                    {HOMOPHONE_THEMES.map(theme => (
                      <option key={theme.value} value={theme.value}>{theme.label}</option>
                    ))}
                  </select>
                </div>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={fuzzyMatching}
                    onChange={e => {
                      setFuzzyMatching(e.target.checked);
                      resetGeneratorState(generatorInput.trim() ? "点击生成候选" : "请输入结果文案");
                    }}
                    style={styles.checkbox}
                  />
                  模糊匹配
                </label>
                <button onClick={() => void generateCandidates()} disabled={isGenerating} style={{
                  ...styles.generatorBtn,
                  ...(isGenerating ? styles.generatorBtnDisabled : {}),
                }}>
                  {isGenerating ? "生成中…" : "生成候选"}
                </button>
              </div>

              <div style={styles.generatorMessage}>{generatorMessage}</div>

              {candidates.length > 0 && (
                <div style={styles.candidateList}>
                  {candidates.map(candidate => (
                    <div key={candidate.id} style={styles.candidateCard}>
                      <div style={styles.candidateTopline}>
                        <span style={styles.candidateTitle}>{labels[candidate.slotIndex] ?? candidate.label}</span>
                        <span style={styles.candidateMeta}>勾选后自动填入该槽</span>
                      </div>
                      <div style={styles.candidateOptionList}>
                        {candidate.options.map(option => {
                          const checked = (selectedCandidateOptions[candidate.slotIndex] ?? []).includes(option.id);
                          return (
                            <label
                              key={option.id}
                              style={{
                                ...styles.candidateOption,
                                ...(checked ? styles.candidateOptionChecked : {}),
                                ...(option.readonly ? styles.candidateOptionReadonly : {}),
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={option.readonly}
                                onChange={e => toggleCandidateOption(candidate, option.id, e.target.checked)}
                                style={styles.checkbox}
                              />
                              <span style={styles.candidateOptionBody}>
                                <span style={styles.candidateOptionText}>{option.text}</span>
                                {option.tags.length > 0 && (
                                  <span style={styles.candidateTagList}>
                                    {option.tags.map(tag => (
                                      <span key={`${option.id}-${tag}`} style={styles.candidateTag}>{tag}</span>
                                    ))}
                                  </span>
                                )}
                                {option.matches.length > 0 && (
                                  <span style={styles.candidateMeta}>
                                    {option.matches.map(match => `${match.token}→${match.replacement}`).join("，")}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Text inputs */}
          <section style={styles.section}>
            <span style={styles.sectionTitle}>文案</span>
            <div style={styles.inputsGrid}>
              {labels.map((lbl, i) => (
                <div key={i} style={styles.inputGroup}>
                  <label style={styles.inputLabel}>{lbl}</label>
                  <input
                    style={{
                      ...styles.input,
                      ...(i === labels.length - 1 ? styles.inputFinal : {}),
                    }}
                    value={texts[i] ?? ""}
                    onChange={e => updateText(i, e.target.value)}
                    placeholder={DEFAULT_TEXTS[style][i]}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Export button */}
          <div style={styles.actions}>
            <button onClick={exportPng} style={styles.exportBtn}>
              导出 PNG
            </button>
          </div>
        </div>

        {/* Canvas preview */}
        <div style={styles.canvasCard}>
          <span style={styles.previewLabel}>预览</span>
          <div style={styles.canvasWrap}>
            <canvas
              ref={canvasRef}
              width={cw}
              height={ch}
              style={styles.canvas}
            />
            {!ready && (
              <div style={styles.loading}>加载素材中…</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Ant Design Style Minimal Styles ──────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f0f2f5",
  },
  main: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "40px 24px 60px",
  },
  header: {
    textAlign: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: 600,
    color: "rgba(0, 0, 0, 0.88)",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(0, 0, 0, 0.45)",
    fontWeight: 400,
  },
  card: {
    background: "#ffffff",
    borderRadius: 8,
    padding: 24,
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)",
    marginBottom: 24,
    border: "1px solid #f0f0f0",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    display: "block",
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(0, 0, 0, 0.88)",
    marginBottom: 16,
  },
  segmentedControl: {
    display: "inline-flex",
    background: "rgba(0, 0, 0, 0.04)",
    borderRadius: 6,
    padding: 2,
    gap: 0,
  },
  segment: {
    padding: "6px 24px",
    fontSize: 14,
    fontWeight: 400,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "rgba(0, 0, 0, 0.65)",
    transition: "all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)",
    cursor: "pointer",
  },
  segmentActive: {
    background: "#ffffff",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)",
    color: "rgba(0, 0, 0, 0.88)",
    fontWeight: 500,
  },
  inputsGrid: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 16,
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    minWidth: 160,
    flex: "1 1 160px",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(0, 0, 0, 0.88)",
  },
  input: {
    padding: "7px 11px",
    fontSize: 14,
    border: "1px solid #d9d9d9",
    borderRadius: 6,
    background: "#ffffff",
    color: "rgba(0, 0, 0, 0.88)",
    outline: "none",
    width: "100%",
    transition: "all 0.2s",
  },
  inputFinal: {
    borderColor: "#1677ff",
    boxShadow: "0 0 0 2px rgba(5, 145, 255, 0.1)",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    paddingTop: 8,
    borderTop: "1px solid #f0f0f0",
    marginTop: 24,
  },
  exportBtn: {
    padding: "8px 24px",
    fontSize: 14,
    fontWeight: 400,
    background: "#1677ff",
    color: "#ffffff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)",
    boxShadow: "0 2px 0 rgba(5, 145, 255, 0.1)",
    marginTop: 16,
  },
  canvasCard: {
    background: "#ffffff",
    borderRadius: 8,
    padding: 24,
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)",
    border: "1px solid #f0f0f0",
  },
  previewLabel: {
    display: "block",
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(0, 0, 0, 0.88)",
    marginBottom: 16,
  },
  canvasWrap: {
    position: "relative" as const,
    background: "#fafafa",
    borderRadius: 6,
    overflow: "hidden",
    lineHeight: 0,
    border: "1px solid #f0f0f0",
  },
  canvas: {
    display: "block",
    maxWidth: "100%",
    height: "auto",
  },
  loading: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    color: "rgba(0, 0, 0, 0.45)",
  },
  ringCountWrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  ringCountInput: {
    width: 80,
    padding: "7px 11px",
    fontSize: 14,
    border: "1px solid #d9d9d9",
    borderRadius: 6,
    background: "#ffffff",
    color: "rgba(0, 0, 0, 0.88)",
    outline: "none",
    textAlign: "center" as const,
  },
  ringCountHint: {
    fontSize: 13,
    color: "rgba(0, 0, 0, 0.45)",
  },
  generatorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16,
  },
  generatorHint: {
    fontSize: 13,
    color: "rgba(0, 0, 0, 0.45)",
    lineHeight: 1.6,
  },
  generatorPanel: {
    border: "1px solid #f0f0f0",
    background: "#fafafa",
    borderRadius: 8,
    padding: 16,
  },
  generatorControls: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "flex-end",
    gap: 16,
  },
  generatorInputGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    minWidth: 220,
    flex: "1 1 220px",
  },
  generatorSelectGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    minWidth: 140,
    flex: "0 1 160px",
  },
  select: {
    padding: "7px 11px",
    fontSize: 14,
    border: "1px solid #d9d9d9",
    borderRadius: 6,
    background: "#ffffff",
    color: "rgba(0, 0, 0, 0.88)",
    outline: "none",
    width: "100%",
    transition: "all 0.2s",
  },
  checkboxLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    fontSize: 14,
    color: "rgba(0, 0, 0, 0.88)",
  },
  checkbox: {
    width: 14,
    height: 14,
    accentColor: "#1677ff",
  },
  generatorBtn: {
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 400,
    background: "#1677ff",
    color: "#ffffff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)",
    boxShadow: "0 2px 0 rgba(5, 145, 255, 0.1)",
  },
  generatorBtnDisabled: {
    background: "#91caff",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  generatorMessage: {
    marginTop: 12,
    fontSize: 13,
    color: "rgba(0, 0, 0, 0.45)",
  },
  candidateList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    marginTop: 16,
  },
  candidateCard: {
    background: "#ffffff",
    border: "1px solid #f0f0f0",
    borderRadius: 8,
    padding: 12,
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
  },
  candidateTopline: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  candidateTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(0, 0, 0, 0.88)",
  },
  applyBtn: {
    padding: "4px 12px",
    fontSize: 13,
    fontWeight: 400,
    border: "1px solid #1677ff",
    borderRadius: 6,
    background: "#ffffff",
    color: "#1677ff",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  candidateSlots: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  candidateOptionList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  candidateOption: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    border: "1px solid #f0f0f0",
    borderRadius: 6,
    background: "#ffffff",
    transition: "all 0.2s",
    cursor: "pointer",
  },
  candidateOptionChecked: {
    borderColor: "#1677ff",
    background: "rgba(22, 119, 255, 0.06)",
    boxShadow: "0 0 0 2px rgba(5, 145, 255, 0.08)",
  },
  candidateOptionReadonly: {
    cursor: "default",
  },
  candidateOptionBody: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  candidateOptionText: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(0, 0, 0, 0.88)",
    lineHeight: 1.5,
  },
  candidateTagList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  candidateTag: {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 6px",
    borderRadius: 4,
    background: "rgba(0, 0, 0, 0.04)",
    color: "rgba(0, 0, 0, 0.65)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  candidateSlot: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 6,
    background: "rgba(0, 0, 0, 0.04)",
    color: "rgba(0, 0, 0, 0.88)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  candidateSlotFinal: {
    background: "rgba(22, 119, 255, 0.08)",
    color: "#1677ff",
  },
  candidateSlotLabel: {
    fontWeight: 500,
    color: "inherit",
  },
  candidateMeta: {
    marginTop: 8,
    fontSize: 12,
    color: "rgba(0, 0, 0, 0.45)",
  },
};
