import Foundation

struct SupabaseConfiguration: Equatable {
    let projectURL: URL
    let anonKey: String

    static func load(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> SupabaseConfiguration? {
        guard
            let rawURL = configValue(
                names: ["KesshoSupabaseURL", "VITE_SUPABASE_URL"],
                bundle: bundle,
                environment: environment
            ),
            let rawAnonKey = configValue(
                names: ["KesshoSupabaseAnonKey", "VITE_SUPABASE_ANON_KEY"],
                bundle: bundle,
                environment: environment
            ),
            let url = normalizedProjectURL(rawURL),
            let anonKey = normalizedValue(rawAnonKey),
            !anonKey.isEmpty
        else {
            return nil
        }

        return SupabaseConfiguration(projectURL: url, anonKey: anonKey)
    }

    private static func configValue(
        names: [String],
        bundle: Bundle,
        environment: [String: String]
    ) -> String? {
        for name in names {
            if let value = bundle.object(forInfoDictionaryKey: name) as? String,
               normalizedValue(value) != nil {
                return value
            }
            if let value = environment[name], normalizedValue(value) != nil {
                return value
            }
        }
        return nil
    }

    private static func normalizedProjectURL(_ rawValue: String) -> URL? {
        guard let value = normalizedValue(rawValue),
              value.lowercased().hasPrefix("http://") || value.lowercased().hasPrefix("https://"),
              let url = URL(string: value.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        else {
            return nil
        }
        return url
    }

    private static func normalizedValue(_ rawValue: String) -> String? {
        var value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty,
              !value.hasPrefix("$("),
              value.lowercased() != "null",
              value.lowercased() != "undefined"
        else {
            return nil
        }

        for name in ["KesshoSupabaseURL", "KesshoSupabaseAnonKey", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] {
            let prefix = "\(name)="
            if value.hasPrefix(prefix) {
                value = String(value.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        if (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
            (value.hasPrefix("'") && value.hasSuffix("'")) {
            value = String(value.dropFirst().dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return value.isEmpty ? nil : value
    }
}

enum SupabaseServiceError: LocalizedError {
    case notConfigured
    case invalidURL
    case invalidResponse
    case httpStatus(Int, String)
    case invalidJSON
    case missingPayload(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Supabase is not configured."
        case .invalidURL:
            return "The Supabase request URL is invalid."
        case .invalidResponse:
            return "Supabase returned an invalid response."
        case let .httpStatus(status, message):
            return "Supabase request failed (\(status)): \(message)"
        case .invalidJSON:
            return "Supabase returned JSON in an unexpected shape."
        case let .missingPayload(hash):
            return "Supabase preset payload is missing: \(hash)"
        }
    }
}

struct SupabaseAuthSession: Equatable {
    let accessToken: String
    let refreshToken: String?
    let userID: String?
    let expiresAt: Date?

    var isExpired: Bool {
        guard let expiresAt else { return false }
        return expiresAt.timeIntervalSinceNow < 60
    }
}

final class SupabaseService {
    private let configuration: SupabaseConfiguration?
    private let urlSession: URLSession
    private var authSession: SupabaseAuthSession?

    init(
        configuration: SupabaseConfiguration? = SupabaseConfiguration.load(),
        urlSession: URLSession = .shared
    ) {
        self.configuration = configuration
        self.urlSession = urlSession
    }

    var isConfigured: Bool {
        configuration != nil
    }

    @discardableResult
    func signInAnonymously() async throws -> SupabaseAuthSession {
        if let authSession, !authSession.isExpired {
            return authSession
        }

        let object = try await requestJSON(
            path: "/auth/v1/signup",
            method: "POST",
            body: [
                "data": [:],
                "gotrue_meta_security": [:],
            ],
            useUserToken: false
        )

        guard let record = object as? [String: Any] else {
            throw SupabaseServiceError.invalidJSON
        }

        let accessToken = record["access_token"] as? String
            ?? (record["session"] as? [String: Any])?["access_token"] as? String
        guard let accessToken else {
            throw SupabaseServiceError.invalidJSON
        }

        let refreshToken = record["refresh_token"] as? String
            ?? (record["session"] as? [String: Any])?["refresh_token"] as? String
        let userRecord = record["user"] as? [String: Any]
            ?? (record["session"] as? [String: Any])?["user"] as? [String: Any]
        let expiresIn = (record["expires_in"] as? NSNumber)?.doubleValue
            ?? ((record["session"] as? [String: Any])?["expires_in"] as? NSNumber)?.doubleValue

        let session = SupabaseAuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            userID: userRecord?["id"] as? String,
            expiresAt: expiresIn.map { Date().addingTimeInterval($0) }
        )
        authSession = session
        return session
    }

    func callFunction(
        named name: String,
        body: [String: Any] = [:],
        requiresUserSession: Bool = false
    ) async throws -> Any {
        if requiresUserSession {
            _ = try await signInAnonymously()
        }
        return try await requestJSON(
            path: "/functions/v1/\(name)",
            method: "POST",
            body: body,
            useUserToken: requiresUserSession
        )
    }

    func callRPC(
        named name: String,
        body: [String: Any] = [:],
        requiresUserSession: Bool = true
    ) async throws -> Any {
        if requiresUserSession {
            _ = try await signInAnonymously()
        }
        return try await requestJSON(
            path: "/rest/v1/rpc/\(name)",
            method: "POST",
            body: body,
            useUserToken: requiresUserSession
        )
    }

    func fetchCloudStatePresets(limit: Int = 50) async throws -> [SavedPreset] {
        guard isConfigured else { return [] }

        do {
            let v2Presets = try await fetchV2StatePresets(limit: limit)
            if !v2Presets.isEmpty {
                return v2Presets
            }
        } catch {
            // Fall back to the legacy table during migration/cutover, matching the web store.
        }

        return try await fetchLegacyStatePresets(limit: limit)
    }

    func saveLegacyStatePreset(_ preset: SavedPreset, visibility: String = "private") async throws {
        let session = try await signInAnonymously()
        var version: [String: Any] = [
            "v": 1,
            "timestamp": preset.timestamp,
            "data": try preset.state.jsonRecord(),
        ]
        if let dualRanges = preset.dualRanges, !dualRanges.isEmpty {
            version["dualRanges"] = try Self.jsonObject(from: dualRanges)
        }

        var row: [String: Any] = [
            "user_id": session.userID as Any,
            "type": "state",
            "scope": NSNull(),
            "name": preset.name,
            "author": "user",
            "library": "cloud",
            "creator": "Native",
            "description": "",
            "tags": [],
            "visibility": visibility,
            "family_name": preset.name,
            "variant_name": preset.name,
            "variant_rank": NSNull(),
            "versions": [version],
            "current_version": 1,
        ]
        if session.userID == nil {
            row["user_id"] = NSNull()
        }

        _ = try await requestJSON(
            path: "/rest/v1/presets",
            queryItems: [URLQueryItem(name: "select", value: "*")],
            method: "POST",
            body: row,
            prefer: "return=representation",
            useUserToken: true
        )
    }

    func incrementPresetPlays(remoteID: String) async {
        do {
            _ = try await callRPC(named: "increment_preset_plays", body: ["preset_id": remoteID], requiresUserSession: false)
        } catch {
            _ = try? await callRPC(named: "increment_plays", body: ["preset_id": remoteID], requiresUserSession: false)
        }
    }

    private func fetchV2StatePresets(limit: Int) async throws -> [SavedPreset] {
        let rows = try await requestArray(
            path: "/rest/v1/presets_v2",
            queryItems: [
                URLQueryItem(name: "select", value: "id,name,updated_at,latest_resolved_hash,visibility,play_count,type,scope,archived"),
                URLQueryItem(name: "type", value: "eq.state"),
                URLQueryItem(name: "archived", value: "eq.false"),
                URLQueryItem(name: "or", value: "(visibility.eq.public,visibility.eq.featured)"),
                URLQueryItem(name: "order", value: "updated_at.desc"),
                URLQueryItem(name: "limit", value: "\(max(1, limit))"),
            ],
            useUserToken: false
        )

        let presetRows = rows.compactMap { $0 as? [String: Any] }
        let hashes = presetRows.compactMap { $0["latest_resolved_hash"] as? String }
        let payloads = try await fetchPayloadsV2(hashes: hashes)

        return try presetRows.compactMap { row in
            guard let id = row["id"] as? String,
                  let name = row["name"] as? String,
                  let hash = row["latest_resolved_hash"] as? String else {
                return nil
            }
            guard let payload = payloads[hash] else {
                throw SupabaseServiceError.missingPayload(hash)
            }
            return try savedPreset(
                remoteID: id,
                name: name,
                timestamp: row["updated_at"] as? String,
                payload: payload
            )
        }
    }

    private func fetchPayloadsV2(hashes: [String]) async throws -> [String: Any] {
        let uniqueHashes = Array(Set(hashes)).filter { !$0.isEmpty }
        guard !uniqueHashes.isEmpty else { return [:] }

        let hashList = uniqueHashes.joined(separator: ",")
        let rows = try await requestArray(
            path: "/rest/v1/preset_payloads_v2",
            queryItems: [
                URLQueryItem(name: "select", value: "hash,payload"),
                URLQueryItem(name: "hash", value: "in.(\(hashList))"),
            ],
            useUserToken: false
        )

        var payloads: [String: Any] = [:]
        for row in rows {
            guard let record = row as? [String: Any],
                  let hash = record["hash"] as? String else { continue }
            payloads[hash] = record["payload"]
        }
        return payloads
    }

    private func fetchLegacyStatePresets(limit: Int) async throws -> [SavedPreset] {
        let rows = try await requestArray(
            path: "/rest/v1/presets",
            queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "type", value: "eq.state"),
                URLQueryItem(name: "or", value: "(visibility.eq.public,visibility.eq.featured)"),
                URLQueryItem(name: "order", value: "updated_at.desc"),
                URLQueryItem(name: "limit", value: "\(max(1, limit))"),
            ],
            useUserToken: false
        )

        return try rows.compactMap { row in
            guard let record = row as? [String: Any],
                  let id = record["id"] as? String,
                  let name = record["name"] as? String else {
                return nil
            }
            let payload = Self.latestLegacyPayload(from: record)
            return try savedPreset(
                remoteID: id,
                name: name,
                timestamp: record["updated_at"] as? String ?? record["created_at"] as? String,
                payload: payload
            )
        }
    }

    private static func latestLegacyPayload(from row: [String: Any]) -> Any {
        if let data = row["data"] as? [String: Any] {
            return data
        }

        guard let versions = row["versions"] as? [[String: Any]], !versions.isEmpty else {
            return row
        }

        let currentVersion = (row["current_version"] as? NSNumber)?.intValue
        let version = currentVersion.flatMap { number in
            versions.first { ($0["v"] as? NSNumber)?.intValue == number }
        } ?? versions.last!

        return version["data"] ?? version
    }

    private func savedPreset(
        remoteID: String,
        name: String,
        timestamp: String?,
        payload: Any
    ) throws -> SavedPreset {
        guard let stateRecord = Self.stateRecord(from: payload) else {
            throw SupabaseServiceError.invalidJSON
        }

        let state = try SliderState.decodeStateRecord(stateRecord)
        let dualRanges = Self.dualRanges(from: payload)
        return SavedPreset(
            name: name,
            timestamp: timestamp ?? ISO8601DateFormatter().string(from: Date()),
            state: state,
            dualRanges: dualRanges,
            remoteID: remoteID,
            library: "cloud"
        )
    }

    private static func stateRecord(from payload: Any) -> [String: Any]? {
        guard let record = payload as? [String: Any] else {
            return nil
        }
        if let state = record["state"] as? [String: Any] {
            return state
        }
        if let data = record["data"] as? [String: Any] {
            return stateRecord(from: data)
        }
        if let resolved = record["resolved"] as? [String: Any] {
            return stateRecord(from: resolved)
        }
        return record
    }

    private static func dualRanges(from payload: Any) -> [String: DualRange]? {
        guard let record = payload as? [String: Any],
              let rawRanges = record["dualRanges"] as? [String: Any] else {
            return nil
        }

        var result: [String: DualRange] = [:]
        for (key, value) in rawRanges {
            guard let range = value as? [String: Any],
                  let min = numericValue(range["min"]),
                  let max = numericValue(range["max"]) else {
                continue
            }
            result[key] = DualRange(min: min, max: max)
        }
        return result.isEmpty ? nil : result
    }

    private static func numericValue(_ value: Any?) -> Double? {
        switch value {
        case let number as Double:
            return number
        case let number as Float:
            return Double(number)
        case let number as Int:
            return Double(number)
        case let number as NSNumber where !(number is Bool):
            return number.doubleValue
        default:
            return nil
        }
    }

    private func requestArray(
        path: String,
        queryItems: [URLQueryItem],
        useUserToken: Bool
    ) async throws -> [Any] {
        let object = try await requestJSON(
            path: path,
            queryItems: queryItems,
            method: "GET",
            useUserToken: useUserToken
        )
        guard let array = object as? [Any] else {
            throw SupabaseServiceError.invalidJSON
        }
        return array
    }

    private func requestJSON(
        path: String,
        queryItems: [URLQueryItem] = [],
        method: String,
        body: [String: Any]? = nil,
        prefer: String? = nil,
        useUserToken: Bool
    ) async throws -> Any {
        guard let configuration else {
            throw SupabaseServiceError.notConfigured
        }

        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        guard let baseURL = URL(string: configuration.projectURL.absoluteString + normalizedPath) else {
            throw SupabaseServiceError.invalidURL
        }
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components?.url else {
            throw SupabaseServiceError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(configuration.anonKey, forHTTPHeaderField: "apikey")
        let bearer = useUserToken ? (authSession?.accessToken ?? configuration.anonKey) : configuration.anonKey
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let prefer {
            request.setValue(prefer, forHTTPHeaderField: "Prefer")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        }

        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SupabaseServiceError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
            throw SupabaseServiceError.httpStatus(httpResponse.statusCode, message)
        }

        guard !data.isEmpty else {
            return NSNull()
        }

        return try JSONSerialization.jsonObject(with: data)
    }

    private static func jsonObject<T: Encodable>(from value: T) throws -> Any {
        let data = try JSONEncoder().encode(value)
        return try JSONSerialization.jsonObject(with: data)
    }
}
