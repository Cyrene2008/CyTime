use reqwest::Url;
use serde::Serialize;

const DEFAULT_VOLUME: f64 = 0.1;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum WindowMode {
    Mini,
    Normal,
    Max,
    Full,
}

impl WindowMode {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "mini" => Some(Self::Mini),
            "normal" => Some(Self::Normal),
            "max" => Some(Self::Max),
            "full" => Some(Self::Full),
            _ => None,
        }
    }
}

#[derive(Debug, PartialEq, Serialize)]
pub(crate) struct UriLaunch {
    pub(crate) uri: String,
    pub(crate) mode: Option<WindowMode>,
    pub(crate) replay: bool,
    pub(crate) sounds: Option<bool>,
    pub(crate) volume: f64,
}

impl UriLaunch {
    pub(crate) fn parse(uri: String, fallback_mode: Option<&str>) -> Result<Self, String> {
        let url = Url::parse(&uri).map_err(|_| "invalid CyTime URI".to_string())?;
        if url.scheme() != "cytime" || !uri.starts_with("cytime://") {
            return Err("invalid CyTime URI".to_string());
        }

        let param = |name| {
            url.query_pairs()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value)
        };
        let mode = param("mode")
            .as_deref()
            .and_then(WindowMode::parse)
            .or_else(|| fallback_mode.and_then(WindowMode::parse));
        let replay = matches!(param("replay").as_deref(), Some("" | "1" | "true"));
        let sounds = match param("sounds").as_deref() {
            Some("1") => Some(true),
            Some("0") => Some(false),
            _ => None,
        };
        let volume = param("volume")
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|value| (0.0..=1.0).contains(value))
            .unwrap_or(DEFAULT_VOLUME);

        Ok(Self {
            uri,
            mode,
            replay,
            sounds,
            volume,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retains_the_raw_route_and_prefers_a_valid_explicit_mode() {
        let uri = "cytime://countdown?length=30&mode=%6dini&replay&sounds=1&volume=0.25";
        let launch = UriLaunch::parse(uri.into(), Some("full")).unwrap();
        assert_eq!(launch.uri, uri);
        assert_eq!(launch.mode, Some(WindowMode::Mini));
        assert!(launch.replay);
        assert_eq!(launch.sounds, Some(true));
        assert_eq!(launch.volume, 0.25);
    }

    #[test]
    fn only_a_valid_fallback_changes_mode_when_the_uri_has_none() {
        for uri in ["cytime://", "cytime://page/time?mode=unknown"] {
            assert_eq!(UriLaunch::parse(uri.into(), None).unwrap().mode, None);
            assert_eq!(
                UriLaunch::parse(uri.into(), Some("max")).unwrap().mode,
                Some(WindowMode::Max)
            );
            assert_eq!(
                UriLaunch::parse(uri.into(), Some("unknown")).unwrap().mode,
                None
            );
        }
    }

    #[test]
    fn accepts_replay_aliases_and_preserves_default_sound_preferences() {
        for replay in ["replay", "replay=1", "replay=true"] {
            assert!(
                UriLaunch::parse(format!("cytime://?{replay}"), None)
                    .unwrap()
                    .replay
            );
        }
        let launch = UriLaunch::parse("cytime://?replay=0&sounds=0&volume=0".into(), None).unwrap();
        assert!(!launch.replay);
        assert_eq!(launch.sounds, Some(false));
        assert_eq!(launch.volume, 0.0);
        let launch = UriLaunch::parse("cytime://?sounds=invalid&volume=1".into(), None).unwrap();
        assert!(!launch.replay);
        assert_eq!(launch.sounds, None);
        assert_eq!(launch.volume, 1.0);
        assert_eq!(
            UriLaunch::parse("cytime://".into(), None).unwrap().sounds,
            None
        );
    }

    #[test]
    fn uses_default_volume_for_missing_or_out_of_range_values() {
        for volume in ["", "NaN", "inf", "-0.1", "1.1", "invalid"] {
            let uri = format!("cytime://?volume={volume}");
            assert_eq!(UriLaunch::parse(uri, None).unwrap().volume, DEFAULT_VOLUME);
        }
        assert_eq!(
            UriLaunch::parse("cytime://".into(), None).unwrap().volume,
            DEFAULT_VOLUME
        );
    }

    #[test]
    fn rejects_invalid_or_unrelated_uris() {
        for uri in [
            "invalid",
            "cytime://[",
            "cytime:mode=mini",
            "https://cytime.example/?mode=mini",
        ] {
            assert!(UriLaunch::parse(uri.into(), None).is_err());
        }
    }
}
