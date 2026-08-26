# Playwright E2E testleri

Bu klasördeki testler gerçek Chromium browser’ı ile çalışır. Varsayılan olarak mevcut production build’i `127.0.0.1:3000` üzerinde başlatır. Dışarıdan hazırlanmış bir preview/staging sunucusuna bağlanmak için `E2E_BASE_URL` verilebilir.

## Güvenlik sınırı

Testler production MongoDB, production Blob store veya gerçek kullanıcı hesabı üzerinde çalıştırılmamalıdır. Login ve RBAC testleri için yalnızca staging’e ait test kullanıcıları kullanılmalıdır. Bakım kaydı oluşturan, duplicate/idempotency veya offline medya senaryoları eklendiğinde staging database ve ayrı Blob store zorunludur; test sonunda fixture temizliği yapılmalıdır.

## Çalıştırma

Local production build hazırsa:

```bash
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Dış staging/preview sunucusu için:

```bash
E2E_BASE_URL=https://staging.example.invalid \
E2E_IDENTIFIER=staging-user \
E2E_PASSWORD='staging-password' \
E2E_VIEWER_IDENTIFIER=staging-viewer \
E2E_VIEWER_PASSWORD='staging-viewer-password' \
E2E_FIXTURE_ENGINE_ID='staging-e2e-engine' \
E2E_FIXTURE_TYPE_KEY='staging-e2e-type' \
 \
npm run test:e2e
```

Parolalar source code’a, commit’e veya log’a yazılmamalıdır. CI kullanımı GitHub Actions secret’ları üzerinden yapılmalıdır. `E2E_IDENTIFIER` ve viewer değişkenleri ayarlanmadığında ilgili testler bilinçli olarak skip olur; anonim login shell, protected health endpoint ve service-worker offline shell testleri yine çalışır. Mutation, duplicate/idempotency ve export testleri ayrıca `E2E_FIXTURE_ENGINE_ID` ile `E2E_FIXTURE_TYPE_KEY` değerlerini ister; bu iki değer yoksa testler skip edilir. Bu değerler yalnızca aynı izole test DB’sinde seed edilmiş fixture kimlikleri olmalıdır; production DB, production Blob store ve gerçek kullanıcı hesabı kullanılmamalıdır.
