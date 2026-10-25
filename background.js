const OFFSCREEN_URL = 'offscreen.html';

async function hasOffscreenDocument() {
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
    });
    return contexts.length > 0;
}

async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) return;

    await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['DOM_SCRAPING', 'AUDIO_PLAYBACK'],
        justification: 'Poll trang phiếu GHN và phát âm thanh cảnh báo'
    });
}

async function closeOffscreenDocument() {
    if (!(await hasOffscreenDocument())) return;
    await chrome.offscreen.closeDocument();
}

async function startBackgroundMonitor(url) {
    await ensureOffscreenDocument();
    await chrome.storage.local.set({
        ticketAlertEnabled: true,
        ticketAlertMonitorUrl: url
    });
    chrome.runtime.sendMessage({ command: 'OFFSCREEN_START_POLL', url });
}

async function stopBackgroundMonitor() {
    if (await hasOffscreenDocument()) {
        chrome.runtime.sendMessage({ command: 'OFFSCREEN_STOP_POLL' });
    }
    await chrome.storage.local.set({ ticketAlertEnabled: false });
    await closeOffscreenDocument();
}

function showTicketNotification(sendResponse) {
    chrome.notifications.create(`ticket-alert-${Date.now()}`, {
        type: 'basic',
        title: 'GHN Auto-Alert',
        message: 'Có phiếu mới cần xử lý!'
    }, () => {
        if (chrome.runtime.lastError) {
            console.warn('GHN Helper Pro: Lỗi tạo notification:', chrome.runtime.lastError.message);
            if (sendResponse) {
                sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
            }
            return;
        }
        if (sendResponse) {
            sendResponse({ status: 'ok' });
        }
    });
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.command === 'TICKET_ALERT_START') {
        startBackgroundMonitor(request.url).then(() => {
            sendResponse({ status: 'ok' });
        }).catch((e) => {
            console.error('GHN Helper Pro: Không khởi động monitor ticket.', e);
            sendResponse({ status: 'error', error: String(e) });
        });
        return true;
    }

    if (request.command === 'TICKET_ALERT_STOP') {
        stopBackgroundMonitor().then(() => {
            sendResponse({ status: 'ok' });
        }).catch((e) => {
            console.error('GHN Helper Pro: Không dừng monitor ticket.', e);
            sendResponse({ status: 'error', error: String(e) });
        });
        return true;
    }

    if (request.command === 'TICKET_COUNT_INCREASED') {
        showTicketNotification();
        return;
    }

    if (request.command === 'SHOW_TICKET_ALERT') {
        showTicketNotification(sendResponse);
        return true;
    }

    if (request.command === 'SEND_GOOGLE_SHEET_BATCH') {
        fetch(request.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request.payload),
            redirect: 'follow'
        })
        .then(async (res) => {
            const text = await res.text();
            if (res.status === 401 || text.includes('ServiceLogin') || text.includes('Không tìm thấy trang') || text.includes('Rất tiếc, không thể mở tệp')) {
                console.error('GHN Helper Pro: ⚠️ Google Script Webhook chưa mở quyền công khai (HTTP 401)! Cần cấu hình "Who has access" = "Anyone" trong Google Apps Script.');
                sendResponse({
                    status: 'error',
                    error: 'Google Apps Script bị lỗi phân quyền (401): Vui lòng kiểm tra lại cấu hình Web App Deployment và chọn "Who has access: Anyone".',
                    isAuthError: true
                });
            } else if (!res.ok) {
                sendResponse({ status: 'error', error: `HTTP ${res.status}: ${text}` });
            } else {
                sendResponse({ status: 'ok', response: text });
            }
        })
        .catch(err => {
            console.error('GHN Helper Pro: Lỗi gửi batch Google Sheet:', err);
            sendResponse({ status: 'error', error: String(err) });
        });
        return true;
    }

    if (request.command === 'FETCH_RECEIVER_INFO') {
        const { orderCode, authHeader, warehouseId } = request;
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*'
        };
        if (authHeader) {
            headers['Authorization'] = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
        }
        if (warehouseId) {
            headers['X-Warehouseid'] = String(warehouseId);
        }

        fetch('https://nhanh-api.ghn.vn/api/lastmile/order/search/receiver-info', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ order_code: orderCode })
        })
        .then(async (res) => {
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                sendResponse({
                    status: 'error',
                    httpStatus: res.status,
                    error: (data && data.message) ? data.message : `HTTP ${res.status}`
                });
            } else {
                sendResponse({ status: 'ok', data: data, httpStatus: res.status });
            }
        })
        .catch(err => {
            console.error('GHN Helper Pro: Lỗi gọi API receiver-info từ background:', err);
            sendResponse({ status: 'error', error: String(err) });
        });
        return true;
    }

    if (request.command === 'FETCH_PRINT_INFO') {
        const { orderCode, authHeader, warehouseId } = request;
        const headers = {
            'Accept': 'application/json, text/plain, */*'
        };
        if (authHeader) {
            headers['Authorization'] = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
        }
        if (warehouseId) {
            headers['X-Warehouseid'] = String(warehouseId);
        }

        const tryFetchPrint = async (type) => {
            const printUrl = `https://inside-prd-api.ghn.vn/oms/v1/printing-page?type=${type}&orderCode=${encodeURIComponent(orderCode)}`;
            const res = await fetch(printUrl, { method: 'GET', headers: headers });
            if (!res.ok) return { ok: false, status: res.status };
            const data = await res.json().catch(() => null);
            return { ok: true, data: data, status: res.status };
        };

        (async () => {
            try {
                const extractHtml = (resObj) => {
                    if (!resObj) return '';
                    if (resObj.data && Array.isArray(resObj.data) && resObj.data.length > 0) {
                        return resObj.data[0];
                    }
                    if (Array.isArray(resObj) && resObj.length > 0) {
                        return resObj[0];
                    }
                    if (typeof resObj.data === 'string' && resObj.data.includes('<')) {
                        return resObj.data;
                    }
                    if (typeof resObj === 'string' && resObj.includes('<')) {
                        return resObj;
                    }
                    return '';
                };

                // 1. Thử khổ mặc định 80x80
                let result = await tryFetchPrint('80x80');
                let html = extractHtml(result.data);

                // 2. Nếu không có HTML, thử tiếp khổ 52x70
                if (!html) {
                    result = await tryFetchPrint('52x70');
                    html = extractHtml(result.data);
                }

                // 3. Nếu vẫn không có, thử tiếp khổ A5
                if (!html) {
                    result = await tryFetchPrint('A5');
                    html = extractHtml(result.data);
                }

                console.log(`[GHN Background] printing-page response for ${orderCode}:`, {
                    hasHtml: !!html,
                    htmlLength: html ? html.length : 0,
                    raw: result.data
                });

                if (html) {
                    sendResponse({ status: 'ok', html: html, raw: result.data });
                } else {
                    let errMsg = 'Không tìm thấy mẫu in';
                    const rawData = result.data;
                    if (rawData && rawData.message) {
                        errMsg = rawData.message;
                    } else if (rawData && Array.isArray(rawData.data) && rawData.data.length === 0) {
                        errMsg = 'Mã đơn không có dữ liệu in';
                    }
                    sendResponse({ status: 'error', error: errMsg, raw: rawData });
                }
            } catch (err) {
                console.error('GHN Helper Pro: Lỗi gọi API printing-page từ background:', err);
                sendResponse({ status: 'error', error: String(err) });
            }
        })();
        return true;
    }
});

chrome.storage.local.get(['ticketAlertEnabled', 'ticketAlertMonitorUrl'], (result) => {
    if (result.ticketAlertEnabled && result.ticketAlertMonitorUrl) {
        startBackgroundMonitor(result.ticketAlertMonitorUrl).catch((e) => {
            console.error('GHN Helper Pro: Không khôi phục monitor ticket.', e);
        });
    }
});
