//
//  ShareViewController.swift
//  Cue — "Share → Cue" from inside TikTok.
//
//  The extension does as little as possible on purpose: a share extension gets
//  very little runtime and can be killed at any moment, so it pulls the URL out
//  of the share payload, hands it to the container app through the `cue://`
//  scheme, and gets out of the way. No network, no ingest.
//
//  It deliberately avoids App Groups, which need an entitlement restricted under
//  free provisioning. A single link fits in a query string.
//
//  Opening the container app is the fiddly part. `UIApplication.shared` is
//  unavailable to extensions, and the old trick of walking the responder chain
//  for `openURL:` has been progressively clamped by Apple and is unreliable on
//  current iOS — it fails silently, which looks exactly like a white flash. So
//  `extensionContext.open` is tried first and the responder chain is kept only
//  as a fallback, with both paths logged so a failure is diagnosable from the
//  Xcode console instead of being invisible.
//

import UIKit
import Social
import os.log
import UniformTypeIdentifiers

private let cueLog = OSLog(subsystem: "com.anika.cue.ShareExtension", category: "share")

class ShareViewController: UIViewController {

    private var handled = false

    override func viewDidLoad() {
        super.viewDidLoad()
        // A share sheet with no UI reads as a glitch. A dark card matching the app
        // makes the hand-off look deliberate for the moment it is on screen.
        view.backgroundColor = UIColor(red: 0.043, green: 0.043, blue: 0.051, alpha: 1)

        let label = UILabel()
        label.text = "Sending to Cue…"
        label.textColor = .white
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !handled else { return }
        handled = true

        extractURL { [weak self] url in
            guard let self else { return }
            DispatchQueue.main.async {
                guard let url else {
                    os_log("no URL found in share payload", log: cueLog, type: .error)
                    return self.finish()
                }
                os_log("extracted URL: %{public}@", log: cueLog, type: .info, url)
                self.openContainerApp(with: url)
            }
        }
    }

    /// TikTok hands the post over as a URL attachment, or as plain text with a
    /// link inside it, depending on where the share started. Both are normal.
    private func extractURL(_ completion: @escaping (String?) -> Void) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }

        for provider in providers {
            os_log("attachment types: %{public}@", log: cueLog, type: .info,
                   provider.registeredTypeIdentifiers.joined(separator: ", "))
        }

        func scan(_ remaining: [NSItemProvider]) {
            guard let provider = remaining.first else { return completion(nil) }
            let rest = Array(remaining.dropFirst())

            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                    if let url = item as? URL { return completion(url.absoluteString) }
                    if let s = item as? String, let found = Self.firstURL(in: s) { return completion(found) }
                    scan(rest)
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                    if let text = item as? String, let found = Self.firstURL(in: text) { return completion(found) }
                    scan(rest)
                }
            } else {
                scan(rest)
            }
        }
        scan(providers)
    }

    /// Shared text is usually a caption with the link buried in it.
    static func firstURL(in text: String) -> String? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..., in: text)
        return detector?.firstMatch(in: text, range: range)?.url?.absoluteString
    }

    private func openContainerApp(with sharedURL: String) {
        var components = URLComponents()
        components.scheme = "cue"
        components.host = "share"
        components.queryItems = [URLQueryItem(name: "url", value: sharedURL)]
        guard let deepLink = components.url else { return finish() }

        // Order matters. `extensionContext.open` is the supported API and must be
        // called while the context is still live, so it goes first. Only if it
        // reports failure do we complete the request and fall back to walking the
        // responder chain — the reverse order silently does nothing, because a
        // completed context can no longer open anything.
        guard let context = extensionContext else { return }

        context.open(deepLink) { opened in
            os_log("extensionContext.open -> %{public}@", log: cueLog, type: .info,
                   opened ? "opened" : "refused")
            DispatchQueue.main.async {
                if opened {
                    context.completeRequest(returningItems: [], completionHandler: nil)
                    return
                }
                context.completeRequest(returningItems: []) { _ in
                    DispatchQueue.main.async {
                        let ok = self.openViaResponderChain(deepLink)
                        os_log("responder-chain fallback -> %{public}@", log: cueLog, type: ok ? .info : .error,
                               ok ? "opened" : "no responder answered openURL:")
                    }
                }
            }
        }
    }

    /// Walks the responder chain for anything that still answers `openURL:`.
    @discardableResult
    private func openViaResponderChain(_ url: URL) -> Bool {
        var responder: UIResponder? = self
        let selector = sel_registerName("openURL:")
        while let current = responder {
            if current.responds(to: selector) {
                _ = current.perform(selector, with: url)
                return true
            }
            responder = current.next
        }
        return false
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
