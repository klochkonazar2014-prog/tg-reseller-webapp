function startCountdown(endTime, elements, isMini = false) {
    if (!elements) return;
    const targets = Array.isArray(elements) ? elements : [elements];

    function update() {
        const now = Math.floor(Date.now() / 1000);
        const diff = endTime - now;

        if (diff <= 0) {
            targets.forEach(el => el.innerText = t('available_now') || 'Available');
            return false;
        }

        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);

        const display = isMini
            ? (d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`)
            : `${d > 0 ? d + 'd ' : ''}${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}:${Math.floor(diff % 60) < 10 ? '0' + Math.floor(diff % 60) : Math.floor(diff % 60)}`;

        targets.forEach(el => el.innerText = display);
        return true;
    }

    if (update()) {
        const interval = setInterval(() => {
            if (!update()) clearInterval(interval);
        }, 1000);
    }
}
