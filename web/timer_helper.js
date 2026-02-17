function startCountdown(endTime, elements, isMini = false) {
    if (!elements) return;
    const targets = Array.isArray(elements) ? elements : [elements];

    function update() {
        const now = Math.floor(Date.now() / 1000);
        const diff = endTime - now;

        if (diff <= 0) {
            targets.forEach(el => {
                if (typeof t === 'function') {
                    el.innerText = t('available_now') || 'Доступно';
                } else {
                    el.innerText = 'Доступно';
                }
            });
            return false;
        }

        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;

        // Compact format: show only 2 units
        let display;
        if (isMini) {
            // For mini timers on cards: JUST "55d 3h" - NO extra text
            if (d > 0) {
                display = `${d}d ${h}h`;
            } else if (h > 0) {
                display = `${h}h ${m}m`;
            } else {
                display = `${m}m`;
            }
        } else {
            // For product view timer: ONE LINE format
            if (d > 0) {
                display = `${d}д ${h}ч`;
            } else if (h > 0) {
                display = `${h}ч ${m}м`;
            } else {
                display = `${m}м`;
            }
        }

        targets.forEach(el => el.innerText = display);
        return true;
    }

    if (update()) {
        const interval = setInterval(() => {
            if (!update()) clearInterval(interval);
        }, 1000);
    }
}
