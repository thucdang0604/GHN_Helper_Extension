// content.js - Entry point for GHN Helper Pro extension

// 1. Luôn tự động tiêm inject.js vào trang web để bắt API
function injectMainScript() {
    if (document.getElementById('ghn-inject-script')) return;

    const parent = document.head || document.documentElement;
    if (!parent) {
        // document_start: chưa có node nào để gắn script, đợi DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => injectMainScript(), { once: true });
        return;
    }

    const script = document.createElement('script');
    script.id = 'ghn-inject-script';
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function () { this.remove(); };
    parent.appendChild(script);
}
injectMainScript();

// 2. Tính năng ẩn: Tự động gom Batch và lưu thông tin Add-Item vào Google Sheet (Luôn chạy dưới nền)
(function initAutoSaveGoogleSheet() {
    const GOOGLE_SCRIPT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzAXE76U7bljevf-lHH8v8a4gwRdmSf7JlokKF-0T1bSfyWCTRHEZhEPNrsZfI8IMWL/exec";

    let dataQueue = [];
    let batchTimer = null;
    const BATCH_DELAY_MS = 1500; // Đợi 1.5 giây sau request cuối cùng mới gửi
    const MAX_BATCH_SIZE = 100;  // Nếu gom đủ 100 đơn thì gửi ngay không cần chờ
    
    // Bộ nhớ đệm chống ghi trùng đơn (lưu trong 60 giây)
    const recentlySent = new Map();

    function cleanExpiredCache() {
        const now = Date.now();
        for (const [key, timestamp] of recentlySent.entries()) {
            if (now - timestamp > 60000) {
                recentlySent.delete(key);
            }
        }
    }

    function sendBatchToGoogleSheet() {
        if (dataQueue.length === 0) return;

        const payload = dataQueue.splice(0, dataQueue.length);
        console.log(`🚀 [GHN Auto Save] Đang gửi BATCH ${payload.length} đơn sang Google Sheet...`, payload);

        // Gửi qua background service worker để đảm bảo không bị chặn bởi CORS hay khi tab bị đóng
        chrome.runtime.sendMessage({
            command: 'SEND_GOOGLE_SHEET_BATCH',
            url: GOOGLE_SCRIPT_WEBHOOK_URL,
            payload: payload
        }, (res) => {
            if (res && res.status === 'ok') {
                console.log(`✅ [GHN Auto Save] Đã lưu THÀNH CÔNG BATCH ${payload.length} đơn vào Google Sheet!`, res.response);
            } else {
                console.error("❌ [GHN Auto Save] Lỗi khi gửi dữ liệu sang Google Sheet:", res?.error);
                // Nếu lỗi mạng, đẩy ngược lại vào hàng chờ
                dataQueue.unshift(...payload);
            }
        });
    }

    function queueRecord(records) {
        if (!records || records.length === 0) return;

        cleanExpiredCache();
        const now = Date.now();
        const uniqueRecords = [];

        records.forEach(item => {
            if (!item || !item.orderCode) return;
            const uniqueKey = `${item.orderCode}_${item.tripCode || ''}`;
            
            // Nếu đơn này chưa từng được xếp vào hàng chờ trong 60s qua
            if (!recentlySent.has(uniqueKey)) {
                recentlySent.set(uniqueKey, now);
                uniqueRecords.push(item);
            } else {
                console.log(`⚠️ [GHN Auto Save] Bỏ qua đơn trùng lặp: ${item.orderCode}`);
            }
        });

        if (uniqueRecords.length === 0) return;

        dataQueue.push(...uniqueRecords);
        console.log(`📥 [GHN Auto Save] Đã gom vào hàng chờ: ${uniqueRecords.length} item (Tổng chờ gửi: ${dataQueue.length})`);

        if (dataQueue.length >= MAX_BATCH_SIZE) {
            if (batchTimer) clearTimeout(batchTimer);
            sendBatchToGoogleSheet();
            return;
        }

        if (batchTimer) clearTimeout(batchTimer);
        batchTimer = setTimeout(() => {
            sendBatchToGoogleSheet();
        }, BATCH_DELAY_MS);
    }

    // Tự động kích hoạt gửi nốt nếu người dùng bấm Refresh hoặc đóng trang đột ngột
    window.addEventListener('beforeunload', () => {
        if (dataQueue.length > 0) {
            sendBatchToGoogleSheet();
        }
    });

    // Lắng nghe dữ liệu DUY NHẤT qua window.postMessage từ inject.js
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GHN_ADD_ITEM_CAPTURED') {
            const records = event.data.data;
            if (Array.isArray(records) && records.length > 0) {
                queueRecord(records);
            }
        }
    });
})();

// 3. Khởi tạo Config Manager cho các tính năng bật/tắt của Extension
// ConfigManager tự quản lý timing (đợi config load + DOM ready) nên gọi init() ngay là an toàn
if (window.GHNConfigManager) {
    console.log("GHN Helper Pro: Initializing Extension...");
    window.GHNConfigManager.init();
} else {
    console.error("GHN Helper Pro: ConfigManager not found! Extension sẽ không hoạt động.");
}