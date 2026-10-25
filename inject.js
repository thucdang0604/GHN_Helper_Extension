// inject.js - Intercept Fetch & XHR for GHN Helper Pro
(function () {
    if (window.__GHN_INJECT_LOADED__) return;
    window.__GHN_INJECT_LOADED__ = true;

    // Helper xử lý dữ liệu add-item-v1 để lưu Google Sheet
    function processAddItemResponse(data) {
        if (!data) return;
        let items = [];
        if (Array.isArray(data)) {
            items = data;
        } else if (data.data) {
            if (Array.isArray(data.data)) items = data.data;
            else if (data.data.items && Array.isArray(data.data.items)) items = data.data.items;
            else items = [data.data];
        } else if (data.items && Array.isArray(data.items)) {
            items = data.items;
        }

        const records = items.map(item => {
            if (!item || !item.orderCode) return null;
            const contact = item.contact || {};
            return {
                orderCode: item.orderCode,
                tripCode: item.tripCode || "",
                contactName: contact.contactName || "",
                contactPhone: contact.contactPhone || "",
                address: contact.address || "",
                wardName: contact.wardName || "",
                districtName: contact.districtName || "",
                cityName: contact.cityName || "",
                lat: contact.lat || "",
                lng: contact.lng || ""
            };
        }).filter(Boolean);

        if (records.length > 0) {
            console.log(`[GHN-EXT] 🎯 Bắt được ${records.length} đơn add-item:`, records);
            // Gửi qua postMessage đến content.js
            window.postMessage({ type: 'GHN_ADD_ITEM_CAPTURED', data: records }, '*');
        }
    }

    // Helper bắt và lưu thông tin xác thực (Authorization & X-Warehouseid)
    function captureAuthInfo(auth, warehouseId, token) {
        let changed = false;
        if (auth && auth !== window.__GHN_AUTH_HEADER__) {
            window.__GHN_AUTH_HEADER__ = auth;
            changed = true;
        }
        if (warehouseId && warehouseId !== window.__GHN_WAREHOUSE_ID__) {
            window.__GHN_WAREHOUSE_ID__ = warehouseId;
            changed = true;
        }
        if (token && token !== window.__GHN_TOKEN__) {
            window.__GHN_TOKEN__ = token;
            changed = true;
        }
        if (changed) {
            window.dispatchEvent(new CustomEvent('GHN_AUTH_CAPTURED', {
                detail: {
                    authHeader: window.__GHN_AUTH_HEADER__,
                    warehouseId: window.__GHN_WAREHOUSE_ID__,
                    token: window.__GHN_TOKEN__
                }
            }));
            window.postMessage({
                type: 'GHN_AUTH_CAPTURED',
                authHeader: window.__GHN_AUTH_HEADER__,
                warehouseId: window.__GHN_WAREHOUSE_ID__,
                token: window.__GHN_TOKEN__
            }, '*');
        }
    }

    // Tự động quét Storage khi script được tiêm vào trang
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const v = localStorage.getItem(k);
            if (!v) continue;
            if (!window.__GHN_AUTH_HEADER__ && (k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') || v.includes('eyJ'))) {
                if (v.startsWith('eyJ')) {
                    window.__GHN_AUTH_HEADER__ = 'Bearer ' + v.replace(/^["']|["']$/g, '');
                } else {
                    try {
                        const parsed = JSON.parse(v);
                        const t = parsed.token || parsed.access_token || parsed.accessToken || parsed.jwt;
                        if (t && typeof t === 'string' && t.startsWith('eyJ')) {
                            window.__GHN_AUTH_HEADER__ = 'Bearer ' + t;
                        }
                    } catch (e) {}
                }
            }
            if (!window.__GHN_WAREHOUSE_ID__ && (k.toLowerCase().includes('warehouse') || k.toLowerCase().includes('hub'))) {
                try {
                    const parsed = JSON.parse(v);
                    const w = parsed.warehouseId || parsed.warehouse_id || parsed.id;
                    if (w) window.__GHN_WAREHOUSE_ID__ = String(w);
                } catch (e) {
                    if (/^\d{5,10}$/.test(v.trim())) window.__GHN_WAREHOUSE_ID__ = v.trim();
                }
            }
        }
        if (window.__GHN_AUTH_HEADER__ || window.__GHN_WAREHOUSE_ID__) {
            captureAuthInfo(window.__GHN_AUTH_HEADER__, window.__GHN_WAREHOUSE_ID__, window.__GHN_TOKEN__);
        }
    } catch (e) {}

    // Lắng nghe yêu cầu lấy Token từ Content Script
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GHN_REQUEST_AUTH_TOKEN') {
            window.postMessage({
                type: 'GHN_AUTH_CAPTURED',
                authHeader: window.__GHN_AUTH_HEADER__ || '',
                warehouseId: window.__GHN_WAREHOUSE_ID__ || '',
                token: window.__GHN_TOKEN__ || ''
            }, '*');
        }
    });

    // Bắt Fetch API
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : "");

        // Bắt Headers xác thực từ Request
        try {
            const options = args[1] || {};
            const headers = options.headers || {};
            let auth = '';
            let warehouseId = '';
            let token = '';

            if (headers instanceof Headers) {
                auth = headers.get('authorization') || headers.get('Authorization') || '';
                warehouseId = headers.get('x-warehouseid') || headers.get('X-Warehouseid') || '';
                token = headers.get('token') || headers.get('Token') || '';
            } else if (Array.isArray(headers)) {
                headers.forEach(h => {
                    const k = (h[0] || '').toLowerCase();
                    if (k === 'authorization') auth = h[1];
                    if (k === 'x-warehouseid') warehouseId = h[1];
                    if (k === 'token') token = h[1];
                });
            } else if (typeof headers === 'object' && headers !== null) {
                for (const key of Object.keys(headers)) {
                    const lk = key.toLowerCase();
                    if (lk === 'authorization') auth = headers[key];
                    if (lk === 'x-warehouseid') warehouseId = headers[key];
                    if (lk === 'token') token = headers[key];
                }
            }

            if (auth || warehouseId || token) {
                captureAuthInfo(auth, warehouseId, token);
            }

            if (url.includes('ticket-connector/public-api/web/ticket/search')) {
                const t = token || auth;
                if (t && options.body) {
                    window.dispatchEvent(new CustomEvent('GHN_TICKET_REQ_CAPTURED', {
                        detail: { token: t, body: options.body, url }
                    }));
                }
            }
        } catch (e) { }

        const response = await originalFetch.apply(this, args);
        try {
            if (url.includes('oms/v2/order') || url.includes('ready-to-pick')) {
                const clone = response.clone();
                clone.json().then(data => {
                    window.dispatchEvent(new CustomEvent('GHN_API_DATA_EXT', { detail: data }));
                }).catch(e => { });
            } else if ((url.includes('add-item-v1') || url.includes('/trip/add-item')) && response.ok) {
                const clone = response.clone();
                clone.json().then(data => {
                    processAddItemResponse(data);
                }).catch(e => { });
            }
        } catch (e) { }
        return response;
    };

    // Bắt XHR
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (...args) {
        this._reqUrl = args[1];
        return originalXHROpen.apply(this, args);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
        if (!this._reqHeaders) this._reqHeaders = {};
        const lk = header.toLowerCase();
        this._reqHeaders[lk] = value;
        if (lk === 'authorization') {
            captureAuthInfo(value, null, null);
        } else if (lk === 'x-warehouseid') {
            captureAuthInfo(null, value, null);
        } else if (lk === 'token') {
            captureAuthInfo(null, null, value);
        }
        return originalXHRSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        try {
            if (this._reqUrl && this._reqUrl.includes('ticket-connector/public-api/web/ticket/search')) {
                const token = this._reqHeaders ? (this._reqHeaders['token'] || this._reqHeaders['Token']) : null;
                if (token && body) {
                    window.dispatchEvent(new CustomEvent('GHN_TICKET_REQ_CAPTURED', {
                        detail: { token, body, url: this._reqUrl }
                    }));
                }
            }
        } catch (e) { }

        this.addEventListener('load', function () {
            try {
                const resUrl = this.responseURL || this._reqUrl || "";
                if (resUrl.includes('oms/v2/order') || resUrl.includes('ready-to-pick')) {
                    const data = JSON.parse(this.responseText);
                    window.dispatchEvent(new CustomEvent('GHN_API_DATA_EXT', { detail: data }));
                } else if ((resUrl.includes('add-item-v1') || resUrl.includes('/trip/add-item')) && (this.status >= 200 && this.status < 300)) {
                    const data = JSON.parse(this.responseText);
                    processAddItemResponse(data);
                }
            } catch (e) { }
        });
        return originalXHRSend.apply(this, arguments);
    };
    // Bắt sự kiện chuyển trang SPA (React Router pushState & replaceState)
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
        const res = originalPushState.apply(this, args);
        window.dispatchEvent(new CustomEvent('GHN_LOCATION_CHANGED', { detail: { url: window.location.href } }));
        return res;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
        const res = originalReplaceState.apply(this, args);
        window.dispatchEvent(new CustomEvent('GHN_LOCATION_CHANGED', { detail: { url: window.location.href } }));
        return res;
    };

    console.log("[GHN-EXT] Đã tiêm mã bắt API Fetch & XHR (kèm Auto Save Google Sheet & History Navigation) thành công!");
})();