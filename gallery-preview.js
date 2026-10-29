// SPDX-License-Identifier: GPL-3.0-only
// A single lazy renderer is shared by every gallery tile and the image viewer.
import { PRESETS } from "./studio/presets.js";
export const hasPose3D = (id) =>
  Boolean(PRESETS[id.replace(/_(f|d|s|hi|lo)$/, "")]);
export function createGalleryPreview({ lang, t }) {
  let iframe,
    ready,
    target,
    modal = false,
    token = 0,
    timer,
    frame,
    queue = Promise.resolve();
  const overlay = document.createElement("div");
  overlay.className = "pose-3d-overlay";
  overlay.hidden = true;
  const status = document.createElement("div");
  status.className = "pose-3d-status";
  status.setAttribute("role", "status");
  overlay.append(status);
  document.body.append(overlay);
  function position() {
    if (!target?.isConnected) {
      hide();
      return;
    }
    const r = target.getBoundingClientRect(),
      top = modal ? 52 : 0,
      controlsBottom = modal ? 0 : Math.max(
        0,
        document.querySelector('.controls')?.getBoundingClientRect().bottom || 0,
      );
    if (!modal && (r.bottom <= controlsBottom || r.top >= innerHeight)) {
      hide();
      return;
    }
    Object.assign(overlay.style, {
      left: `${r.left}px`,
      top: `${r.top + top}px`,
      width: `${r.width}px`,
      height: `${Math.max(1, r.height - top)}px`,
      // The shared fixed layer must respect the sticky filters above the cards.
      // Clip without resizing the iframe, so scrolling does not reframe the pose.
      clipPath: `inset(${modal ? 0 : Math.max(0, controlsBottom - r.top)}px 0 0 0)`,
    });
    frame = requestAnimationFrame(position);
  }
  function renderer() {
    if (ready) return ready;
    iframe = document.createElement("iframe");
    iframe.title = t("preview3d");
    iframe.tabIndex = -1;
    iframe.src = `studio/?embed=preview&lang=${lang}`;
    iframe.className = "pose-3d-frame";
    iframe.style.visibility = "hidden";
    overlay.prepend(iframe);
    ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Preview timed out")),
        60000,
      );
      iframe.addEventListener(
        "load",
        async () => {
          try {
            const api = iframe.contentWindow.poseStudio;
            if (!api) throw Error("Preview unavailable");
            await api.ready;
            clearTimeout(timeout);
            resolve(api);
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        },
        { once: true },
      );
    }).catch((e) => {
      iframe?.remove();
      iframe = null;
      ready = null;
      throw e;
    });
    return ready;
  }
  function hide() {
    token++;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    if (target) target.classList.remove("has-3d-preview");
    target = null;
    overlay.hidden = true;
    iframe?.contentWindow?.poseStudio?.setPreviewActive(false);
  }
  function show(element, item, { interactive = false, delay = 180 } = {}) {
    hide();
    target = element;
    modal = interactive;
    const own = token;
    timer = setTimeout(() => {
      if (own !== token) return;
      target.classList.add("has-3d-preview");
      overlay.hidden = false;
      overlay.classList.toggle("interactive", modal);
      overlay.classList.toggle("pending", !hasPose3D(item.id));
      if (iframe) iframe.style.visibility = "hidden";
      status.hidden = false;
      status.textContent = t(hasPose3D(item.id) ? "loading3d" : "pending3d");
      position();
      if (!hasPose3D(item.id)) return;
      queue = queue
        .catch(() => {})
        .then(async () => {
          if (own !== token) return;
          try {
            const api = await renderer();
            if (own !== token) return;
            const match = item.id.match(/^(.*)_(f|d|s|hi|lo)$/);
            await api.previewPose(match[1], match[2]);
            if (own !== token) {
              api.setPreviewActive(false);
              return;
            }
            api.setPreviewActive(true);
            iframe.style.visibility = "visible";
            iframe.tabIndex = modal ? 0 : -1;
            status.textContent = t("draft3d");
            overlay.classList.add("loaded");
          } catch (error) {
            if (own === token) status.textContent = t("preview3dError");
            console.warn(error);
          }
        });
    }, delay);
    overlay.classList.remove("loaded");
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hide();
  });
  window.addEventListener("pagehide", () => {
    hide();
    iframe?.remove();
  });
  return { show, hide };
}
