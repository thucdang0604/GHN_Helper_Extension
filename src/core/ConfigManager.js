class ConfigManager {
    constructor() {
        this.globalEnabled = true;
        this.featuresConfig = {};
        this.features = {}; // Registry for feature modules
        this.configLoaded = false; // Flag: config đã load xong từ storage
        this.domReady = false;     // Flag: DOM đã sẵn sàng (DOMContentLoaded)
    }

    // Register a feature module
    registerFeature(id, module) {
        this.features[id] = module;
    }

    // Initialize the manager, load config, and start features
    init() {
        // 1. Theo dõi DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.domReady = true;
                this._tryApply();
            }, { once: true });
        } else {
            // DOM đã sẵn sàng rồi (interactive hoặc complete)
            this.domReady = true;
        }

        // 2. Load config từ storage (bất đồng bộ)
        chrome.storage.local.get(['globalEnabled', 'featuresConfig'], (result) => {
            if (result.globalEnabled !== undefined) {
                this.globalEnabled = result.globalEnabled;
            }
            if (result.featuresConfig !== undefined) {
                this.featuresConfig = result.featuresConfig;
            }
            this.configLoaded = true;
            this._tryApply();
        });

        // 3. Listen for updates from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.command === "UPDATE_CONFIG") {
                this.globalEnabled = request.globalEnabled;
                this.featuresConfig = request.config;
                this.configLoaded = true;
                this.applyConfig();
                sendResponse({ status: "success" });
            }
        });
    }

    // Chỉ apply khi CẢ HAI điều kiện thỏa mãn: config loaded + DOM ready
    _tryApply() {
        if (this.configLoaded && this.domReady) {
            this.applyConfig();
        }
    }

    // Apply configuration to all registered features
    applyConfig() {
        // Chặn apply nếu config chưa load xong (tránh start feature với config rỗng)
        if (!this.configLoaded) {
            return;
        }

        console.log("GHN Helper Pro: Applying configuration", { global: this.globalEnabled, features: this.featuresConfig });
        
        for (const [id, module] of Object.entries(this.features)) {
            const isFeatureEnabled = this.globalEnabled && this.featuresConfig[id] !== false; // Default true if not specified

            if (isFeatureEnabled) {
                if (!module.isRunning) {
                    // Đảm bảo document.body tồn tại trước khi start feature
                    if (document.body) {
                        this._startFeature(id, module);
                    } else {
                        // Body chưa sẵn sàng — observe documentElement và retry khi body xuất hiện
                        console.log(`GHN Helper Pro: Waiting for document.body to start [${id}]`);
                        const bodyObserver = new MutationObserver(() => {
                            if (document.body) {
                                bodyObserver.disconnect();
                                if (!module.isRunning && this.globalEnabled && this.featuresConfig[id] !== false) {
                                    this._startFeature(id, module);
                                }
                            }
                        });
                        bodyObserver.observe(document.documentElement, { childList: true });
                    }
                }
            } else {
                if (module.isRunning) {
                    console.log(`GHN Helper Pro: Stopping feature [${id}]`);
                    try {
                        module.stop();
                        module.isRunning = false;
                    } catch (e) {
                        console.error(`GHN Helper Pro: Error stopping feature [${id}]`, e);
                    }
                }
            }
        }
    }

    // Khởi động feature an toàn
    _startFeature(id, module) {
        console.log(`GHN Helper Pro: Starting feature [${id}]`);
        try {
            module.start();
            module.isRunning = true;
        } catch (e) {
            console.error(`GHN Helper Pro: Error starting feature [${id}]`, e);
        }
    }
}

// Export a singleton instance (we will assign it to window.GHNConfigManager so features can be registered)
window.GHNConfigManager = new ConfigManager();
