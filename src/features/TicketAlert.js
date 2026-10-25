const TicketAlertFeature = {
    id: 'feature_ticketAlert',
    isRunning: false,
    urlCheckInterval: null,
    apiPollInterval: null,
    lastURL: null,
    reqData: null,
    previousTotal: null,

    isTargetPage() {
        try {
            const url = new URL(window.location.href);
            if (url.hostname !== 'noibo.ghn.vn') return false;
            if (!url.pathname.includes('/ghn-ticket')) return false;
            return url.searchParams.get('tab') === 'processing';
        } catch {
            return false;
        }
    },

    start() {
        this.isRunning = true;
        this.lastURL = location.href;
        this.previousTotal = null;

        // Bắt event từ inject.js
        window.addEventListener('GHN_TICKET_REQ_CAPTURED', this.handleCapturedReq.bind(this));

        // Kiểm tra chuyển trang
        if (!this.urlCheckInterval) {
            this.urlCheckInterval = setInterval(() => {
                if (location.href !== this.lastURL) {
                    this.lastURL = location.href;
                    if (!this.isTargetPage()) {
                        this.stopApiPoll();
                    }
                }
            }, 1500);
        }

        console.log('GHN Helper Pro: Ticket Alert Started (Đợi bắt API request...)');
    },

    handleCapturedReq(e) {
        if (!this.isRunning || !this.isTargetPage()) return;

        this.reqData = e.detail;
        console.log('GHN Helper Pro: Đã bắt được token và payload ticket. Bắt đầu poll ngầm...');

        this.startApiPoll();
    },

    startApiPoll() {
        this.stopApiPoll();

        // Mở offscreen sẵn để chuẩn bị phát tiếng
        chrome.runtime.sendMessage({ command: 'TICKET_ALERT_START', url: "dummy" }).catch(() => { });

        this.apiPollInterval = setInterval(async () => {
            if (!this.reqData || !this.isTargetPage()) return;

            try {
                const res = await fetch(this.reqData.url, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'accept': 'application/json',
                        'token': this.reqData.token
                    },
                    body: typeof this.reqData.body === 'string' ? this.reqData.body : JSON.stringify(this.reqData.body)
                });

                if (!res.ok) return;

                const data = await res.json();

                // Cố gắng đếm số lượng từ response của GHN
                let currentCount = 0;
                if (data && data.data && Array.isArray(data.data.data)) {
                    currentCount = data.data.data.length;
                } else if (data && Array.isArray(data.data)) {
                    currentCount = data.data.length;
                } else if (data && data.data && typeof data.data.total === 'number') {
                    currentCount = data.data.total;
                } else if (data && typeof data.total === 'number') {
                    currentCount = data.total;
                } else if (data && data.data && data.data.data) {
                    // fallbacks...
                }

                console.log(`🔥 [GHN Helper Pro] Vừa check API ngầm. Số ticket hiện tại: ${currentCount} | Lần trước: ${this.previousTotal}`);

                if (this.previousTotal !== null && currentCount > this.previousTotal) {
                    console.log("🚨 [GHN Helper Pro] SỐ TICKET TĂNG LÊN! Kích hoạt báo động!");
                    // Gửi lệnh thông báo cho Background
                    chrome.runtime.sendMessage({ command: 'TICKET_COUNT_INCREASED' });

                    // Phát luôn âm thanh trực tiếp trên tab này (giống PackageAlert)
                    try {
                        const audioUrl = chrome.runtime.getURL('assets/sounds/ticket.mp3');
                        const alertAudio = new Audio(audioUrl);
                        alertAudio.play().catch(e => {
                            console.warn("🔔 Trình duyệt chặn âm thanh. Hãy bấm chuột 1 lần vào trang web!", e);
                        });
                    } catch (err) {
                        console.error("Lỗi phát âm thanh:", err);
                    }
                }

                this.previousTotal = currentCount;

            } catch (e) {
                console.warn("GHN Helper Pro: Lỗi poll API ticket ngầm", e);
            }
        }, 30000); // 15 giây 1 lần
    },

    stopApiPoll() {
        if (this.apiPollInterval) {
            clearInterval(this.apiPollInterval);
            this.apiPollInterval = null;
        }
        chrome.runtime.sendMessage({ command: 'TICKET_ALERT_STOP' }).catch(() => { });
    },

    stop() {
        this.isRunning = false;
        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval);
            this.urlCheckInterval = null;
        }
        window.removeEventListener('GHN_TICKET_REQ_CAPTURED', this.handleCapturedReq.bind(this));
        this.stopApiPoll();
        console.log('GHN Helper Pro: Ticket Alert Stopped');
    }
};

if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(TicketAlertFeature.id, TicketAlertFeature);
}
