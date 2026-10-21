// huEVO-интеграция для FNAF 1 (HTML5-порт Clickteam Fusion).
//
// Минимум по протоколу huEVO:
//   1) подписка на события pause/resume/visibility и пауза игры, пока
//      huEVO показывает диалог поверх приложения или вкладка huEVO скрыта;
//   2) huevo.init() — «рукопожатие» со страницей huEVO (в test-режиме приложения
//      huEVO сообщает mode='test').
//
// Если страница открыта НЕ внутри huEVO (обычный сайт), все вызовы SDK
// завершаются ошибкой not_embedded — мы их молча пропускаем, и игра ведёт себя
// ровно как на оригинальном сайте.
(function () {
    'use strict';

    // Clickteam Fusion листает кадры через window.requestAnimationFrame(updateApplication);
    // резервный путь (без vsync) — window.setTimeout(updateApplication, delta).
    // Перехватываем ТОЛЬКО этот именованный цикл, остальные таймеры/RAF не трогаем.
    var LOOP_NAME = 'updateApplication';

    var rawRAF = window.requestAnimationFrame && window.requestAnimationFrame.bind(window);
    var rawTimeout = window.setTimeout.bind(window);
    var paused = false;
    var buffer = [];    // калбэки игрового цикла, накопленные на паузе
    var now = function () {
        return (window.performance && window.performance.now)
            ? window.performance.now() : Date.now();
    };

    function setPaused(p) {
        p = !!p;
        if (p === paused) return;
        paused = p;
        if (!paused && buffer.length) {
            var list = buffer; buffer = [];
            for (var i = 0; i < list.length; i++) {
                try { if (list[i].needsTs) list[i].fn(now()); else list[i].fn(); } catch (e) {}
            }
        }
    }

    if (rawRAF) {
        window.requestAnimationFrame = function (cb) {
            if (paused) { buffer.push({ fn: cb, needsTs: true }); return 0; }
            return rawRAF(function (t) {
                if (paused) { buffer.push({ fn: cb, needsTs: true }); return; }
                cb(t);
            });
        };
    }

    window.setTimeout = function (fn) {
        if (paused && fn && typeof fn === 'function' && fn.name === LOOP_NAME) {
            buffer.push({ fn: fn, needsTs: false });
            return 0;
        }
        return rawTimeout.apply(window, arguments);
    };

    // ---- SDK ----
    function wire() {
        if (!window.huevo || typeof window.huevo !== 'object') return;

        var dialogPause = false, hiddenPause = false;
        var apply = function () { setPaused(dialogPause || hiddenPause); };
        try {
            if (huevo.on) {
                huevo.on('pause', function () { dialogPause = true; apply(); });
                huevo.on('resume', function () { dialogPause = false; apply(); });
                huevo.on('visibility', function (e) {
                    hiddenPause = !!(e && e.hidden); apply();
                });
            }
        } catch (e) { /* события не критичны */ }

        // init: проверить связь с huEVO (вне huEVO — отклонится с not_embedded).
        try {
            var p = huevo.init && huevo.init();
            if (p && typeof p.then === 'function') {
                p.then(function (res) {
                    var mode = (res && res.mode) || '?';
                    try { console.info && console.info('[huEVO] подключено, запуск mode=' + mode); } catch (e) {}
                }, function () { /* not_embedded / timeout — работаем как оригинал */ });
            }
        } catch (e) {}

        // отладочное/API наружу (если понадобится тестам)
        window.huevoFnaf = { setPaused: setPaused };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})();
