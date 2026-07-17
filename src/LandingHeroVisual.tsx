import { useEffect, useRef } from "react";

export function LandingHeroVisual() {
  const visualRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const visual = visualRef.current;
    const hero = visual?.closest<HTMLElement>(".landing-hero");
    if (!visual || !hero) return undefined;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    let targetX = 0;
    let targetY = 0;
    let targetScroll = 0;
    let currentX = 0;
    let currentY = 0;
    let currentScroll = 0;

    const motionEnabled = () => finePointer.matches && !reducedMotion.matches;

    const renderFrame = () => {
      frame = 0;
      if (!visible || document.hidden || !motionEnabled()) return;

      currentX += (targetX - currentX) * 0.1;
      currentY += (targetY - currentY) * 0.1;
      currentScroll += (targetScroll - currentScroll) * 0.12;

      visual.style.setProperty("--hero-image-x", `${currentX * -14}px`);
      visual.style.setProperty("--hero-image-y", `${currentY * -8 - currentScroll * 18}px`);
      visual.style.setProperty("--hero-image-scale", `${1.035 + currentScroll * 0.026}`);
      visual.style.setProperty("--hero-foreground-x", `${currentX * 22}px`);
      visual.style.setProperty("--hero-foreground-y", `${currentY * 11 - currentScroll * 24}px`);
      visual.style.setProperty("--hero-light-x", `${43 + currentX * 14}%`);
      visual.style.setProperty("--hero-light-y", `${28 + currentY * 10}%`);
      // Warm wash that lets the hero dissolve into the apartment scene
      // instead of a hard cut between the two photographs.
      const exitWash = Math.min(1, Math.max(0, (currentScroll - 0.22) / 0.68));
      visual.style.setProperty("--hero-exit-opacity", `${exitWash * exitWash * (3 - 2 * exitWash) * 0.92}`);

      const stillMoving = Math.abs(targetX - currentX) > 0.001
        || Math.abs(targetY - currentY) > 0.001
        || Math.abs(targetScroll - currentScroll) > 0.001;
      if (stillMoving) frame = window.requestAnimationFrame(renderFrame);
    };

    const scheduleFrame = () => {
      if (!frame && visible && !document.hidden && motionEnabled()) {
        frame = window.requestAnimationFrame(renderFrame);
      }
    };

    const updateScrollTarget = () => {
      const rect = hero.getBoundingClientRect();
      targetScroll = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height, 1)));
      scheduleFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!motionEnabled()) return;
      const rect = hero.getBoundingClientRect();
      targetX = Math.min(0.5, Math.max(-0.5, (event.clientX - rect.left) / rect.width - 0.5));
      targetY = Math.min(0.5, Math.max(-0.5, (event.clientY - rect.top) / rect.height - 0.5));
      scheduleFrame();
    };

    const handlePointerLeave = () => {
      targetX = 0;
      targetY = 0;
      scheduleFrame();
    };

    const clearMotionStyles = () => {
      [
        "--hero-image-x",
        "--hero-image-y",
        "--hero-image-scale",
        "--hero-foreground-x",
        "--hero-foreground-y",
        "--hero-light-x",
        "--hero-light-y",
        "--hero-exit-opacity",
      ].forEach((property) => visual.style.removeProperty(property));
    };

    const handlePreferenceChange = () => {
      if (!motionEnabled()) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        targetX = 0;
        targetY = 0;
        targetScroll = 0;
        currentX = 0;
        currentY = 0;
        currentScroll = 0;
        clearMotionStyles();
        return;
      }
      updateScrollTarget();
    };

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) updateScrollTarget();
      else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    }, { threshold: 0.01 });

    intersectionObserver.observe(hero);
    hero.addEventListener("pointermove", handlePointerMove, { passive: true });
    hero.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", updateScrollTarget, { passive: true });
    document.addEventListener("visibilitychange", updateScrollTarget);
    finePointer.addEventListener("change", handlePreferenceChange);
    reducedMotion.addEventListener("change", handlePreferenceChange);
    updateScrollTarget();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      hero.removeEventListener("pointermove", handlePointerMove);
      hero.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", updateScrollTarget);
      document.removeEventListener("visibilitychange", updateScrollTarget);
      finePointer.removeEventListener("change", handlePreferenceChange);
      reducedMotion.removeEventListener("change", handlePreferenceChange);
      clearMotionStyles();
    };
  }, []);

  return (
    <div ref={visualRef} className="landing-hero-visual" aria-hidden="true">
      <picture className="landing-hero-picture">
        <source media="(max-width: 640px)" srcSet="/media/hero-seine-heatwave-v1-mobile.jpg" />
        <img
          className="landing-hero-image"
          src="/media/hero-seine-heatwave-v1.jpg"
          width="1672"
          height="941"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          alt=""
        />
      </picture>
      <div className="landing-hero-color-wash" />
      <div className="landing-hero-sun-bloom" />
      <div className="landing-hero-refraction landing-hero-refraction--high" />
      <div className="landing-hero-refraction landing-hero-refraction--low" />
      <div className="landing-hero-river-glints">
        <i /><i /><i /><i />
      </div>
      <div className="landing-hero-particles">
        <i /><i /><i /><i /><i /><i /><i />
      </div>
      <div className="landing-hero-scrim" />
      <div className="landing-hero-depth-frame" />
      <div className="landing-hero-exit" />
    </div>
  );
}
