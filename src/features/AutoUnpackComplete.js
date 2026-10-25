const AutoUnpackCompleteFeature = {
    id: 'feature_autoUnpackComplete',
    isRunning: false,
    timer: null,
    audioUrl: null,

    getOrderCount(selector, removeNonDigits = false) {
        const element = document.querySelector(selector);
        if (element) {
            let text = element.textContent.trim();
            return removeNonDigits ? parseInt(text.replace(/\D/g, ''), 10) : parseInt(text, 10);
        }
        return null;
    },

    findCompleteButton() {
        return document.querySelector('[class*="btnCompleteProcess"], [class*="_btnCompleteProcess_"]') ||
               Array.from(document.querySelectorAll('button')).find(b => {
                   const t = (b.textContent || '').trim().toLowerCase();
                   return t.includes('hoàn tất rã kiện') && b.offsetParent !== null;
               });
    },

    playPikachuSound() {
        if (!this.audioUrl) {
            this.audioUrl = chrome.runtime.getURL('assets/sounds/pikachu.mp3');
        }
        const audio = new Audio(this.audioUrl);
        audio.play().catch(error => {
            console.warn("GHN Helper Pro: ❌ Lỗi phát âm thanh Pikachu:", error);
            const remoteAudio = new Audio('https://tiengdong.com/wp-content/uploads/Am-thanh-tieng-Pikachu-www_tiengdong_com.mp3');
            remoteAudio.play().catch(e => console.error("GHN Helper Pro: Lỗi phát âm thanh remote Pikachu:", e));
        });
    },

    autoClickComplete() {
        if (!this.isRunning) return;

        let totalOrders = this.getOrderCount('p:has(span[style*="font-size: 14px"]) span', true);
        let correctOrders = this.getOrderCount('p:has(span[style*="color: rgb(0, 85, 136)"]) span');

        // Fallback: Tìm qua các span hoặc khối text có chứa số lượng
        if (totalOrders === null || correctOrders === null) {
            const spans = Array.from(document.querySelectorAll('p span, div span'));
            spans.forEach(s => {
                const parentText = (s.parentElement ? s.parentElement.textContent : '').toLowerCase();
                const text = s.textContent.trim();
                const num = parseInt(text.replace(/\D/g, ''), 10);
                if (!isNaN(num)) {
                    if (parentText.includes('đã đóng kiện') || parentText.includes('tổng đơn')) {
                        totalOrders = num;
                    } else if (parentText.includes('rã đúng') || parentText.includes('hợp lệ')) {
                        correctOrders = num;
                    }
                }
            });
        }

        console.log('GHN Helper Pro: 📌 Tổng đơn hàng đã đóng kiện:', totalOrders);
        console.log('GHN Helper Pro: 📌 Đơn hàng rã đúng:', correctOrders);

        if (totalOrders !== null && correctOrders !== null && totalOrders > 0 && totalOrders === correctOrders) {
            const completeButton = this.findCompleteButton();
            if (completeButton && !completeButton.disabled) {
                console.log('GHN Helper Pro: ✅ [LOG] Số lượng khớp! Click vào "HOÀN TẤT RÃ KIỆN"');
                completeButton.click();
                this.playPikachuSound();
            }
        } else {
            console.log('GHN Helper Pro: ⏳ [LOG] Số lượng chưa khớp, chờ kiểm tra lại...');
        }
    },

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        if (this.timer) {
            clearInterval(this.timer);
        }

        this.timer = setInterval(() => this.autoClickComplete(), 1000);
        console.log('GHN Helper Pro: Auto Unpack Complete Feature Started!');
    },

    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('GHN Helper Pro: Auto Unpack Complete Feature Stopped!');
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(AutoUnpackCompleteFeature.id, AutoUnpackCompleteFeature);
}
