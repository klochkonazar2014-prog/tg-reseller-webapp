function startCountdown(endTime, elements, isMini = false) {
    if (!elements) return;
    const targets = Array.isArray(elements) ? elements : [elements];

    function update() {
        const now = Math.floor(Date.now() / 1000);
        const diff = endTime - now;

        if (diff <= 0) {
            targets.forEach(el => {
                const expiredText = typeof t === 'function' ? t('expired') : 'EXPIRED';
                el.innerHTML = `<span style="color:#FF3B30; font-weight:800;">${expiredText}</span>`;
            });
            return false;
        }

        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;

        const endDate = new Date(endTime * 1000);
        const dateStr = endDate.toLocaleDateString(typeof CURRENT_LANG !== 'undefined' ? (CURRENT_LANG === 'ru' ? 'ru-RU' : 'en-US') : 'ru-RU', { month: 'short', day: 'numeric', year: 'numeric' });
        const pad = (n) => n.toString().padStart(2, '0');

        if (isMini) {
            // For mini timers on cards: JUST "14d 9h"
            let display;
            const dayCh = typeof CURRENT_LANG !== 'undefined' ? (CURRENT_LANG === 'ru' ? 'д' : 'd') : 'д';
            const hourCh = typeof CURRENT_LANG !== 'undefined' ? (CURRENT_LANG === 'ru' ? 'ч' : 'h') : 'ч';
            const minCh = typeof CURRENT_LANG !== 'undefined' ? (CURRENT_LANG === 'ru' ? 'м' : 'm') : 'м';

            if (d > 0) display = `${d}${dayCh} ${h}${hourCh}`;
            else if (h > 0) display = `${h}${hourCh} ${m}${minCh}`;
            else display = `${m}${minCh}`;
            targets.forEach(el => el.innerText = display);
        } else {
            // For product view timer: Pricing Card Style
            const html = `
                <div class="market-timer-box-premium" style="display: block !important; width: 100% !important;">
                    <div class="mt-premium-top" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span class="mt-premium-label">${typeof t === 'function' ? t('ends_in') : 'Ends in'}&nbsp;</span>
                        <span class="mt-premium-date">${dateStr}</span>
                    </div>
                    <div class="mt-premium-val" style="display: block; width: 100%; text-align: left;">${d}d : ${pad(h)} : ${pad(m)} : ${pad(s)}</div>
                </div>
            `;
            targets.forEach(el => el.innerHTML = html);
        }
        return true;
    }

    if (update()) {
        const interval = setInterval(() => {
            if (!update()) clearInterval(interval);
        }, 1000);
    }
}
