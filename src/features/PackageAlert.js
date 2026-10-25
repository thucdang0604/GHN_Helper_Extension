const PackageAlertFeature = {
    id: 'feature_packageAlert',
    isRunning: false,
    observer: null,
    hasNotified: false,
    audioUrl: null,

    checkCompletion() {
        if (!this.isRunning) return;

        const items = document.querySelectorAll('[class*="itemSuggest"], [class*="_itemSuggest_"]');
        if (items.length === 0) return;

        let allFinished = true;
        let validGroupsFound = 0;

        items.forEach((item) => {
            const countSpan = item.querySelector('[class*="textCountPackage"] span, [class*="_textCountPackage_"] span') ||
                              Array.from(item.querySelectorAll('span')).find(s => (s.textContent || '').includes('/'));
            if (countSpan) {
                const countText = (countSpan.textContent || countSpan.innerText).trim();
                const parts = countText.split('/');

                if (parts.length === 2) {
                    const received = parseInt(parts[0].trim(), 10);
                    const total = parseInt(parts[1].trim(), 10);

                    if (!isNaN(received) && !isNaN(total) && total > 0) {
                        validGroupsFound++;

                        if (received < total) {
                            allFinished = false;
                        }
                    }
                }
            }
        });

        if (validGroupsFound > 0 && allFinished && !this.hasNotified) {
            console.log("GHN Helper Pro: 🚀 Đã nhận đủ tất cả các kiện! Đang phát âm thanh...");

            if (!this.audioUrl) {
                this.audioUrl = chrome.runtime.getURL('assets/sounds/success.mp3');
            }

            const notificationAudio = new Audio(this.audioUrl);
            notificationAudio.play().catch(e => {
                console.warn("GHN Helper Pro: 🔔 Trình duyệt chặn âm thanh tự động. Hãy bấm chuột 1 lần vào trang web sau khi load!", e);
            });

            this.hasNotified = true;
        }

        if (!allFinished) {
            this.hasNotified = false;
        }
    },

    start() {
        this.isRunning = true;
        this.hasNotified = false;

        if (!this.observer) {
            this.observer = new MutationObserver(() => this.checkCompletion());
        }

        const targetNode = document.body;
        if (!targetNode) {
            console.warn("GHN Helper Pro: [PackageAlert] document.body chưa sẵn sàng, hoãn observe.");
            return;
        }
        this.observer.observe(targetNode, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true
        });

        console.log("GHN Helper Pro: Package Alert Started!");
    },

    stop() {
        this.isRunning = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        console.log("GHN Helper Pro: Package Alert Stopped!");
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(PackageAlertFeature.id, PackageAlertFeature);
}
