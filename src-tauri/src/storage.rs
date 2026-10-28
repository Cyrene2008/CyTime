use serde_json::Value;

pub fn apply_changes(all: &Value, updates: &Value, remove_keys: &[String], clear: bool) -> Result<Value, String> {
    let mut next = all.as_object().ok_or_else(|| "storage is not an object".to_string())?.clone();
    let values = updates.as_object().ok_or_else(|| "updates are not an object".to_string())?;
    if values.keys().chain(remove_keys.iter()).any(|key| !key.starts_with("cytime.")) {
        return Err("unsupported storage key".to_string());
    }
    if clear { next.retain(|key, _| !key.starts_with("cytime.")); }
    for key in remove_keys { next.remove(key); }
    for (key, value) in values { next.insert(key.clone(), value.clone()); }
    Ok(Value::Object(next))
}

#[cfg(test)]
mod tests {
    use super::apply_changes;
    use serde_json::json;

    #[test]
    fn partial_restore_preserves_unselected_data() {
        let original = json!({"cytime.settings.v2": {"theme": "dark"}, "cytime.content.v1": {"notepad": "keep"}});
        let next = apply_changes(&original, &json!({"cytime.settings.v2": {"theme": "light"}}), &[], false).unwrap();
        assert_eq!(next["cytime.settings.v2"]["theme"], "light");
        assert_eq!(next["cytime.content.v1"]["notepad"], "keep");
        assert_eq!(original["cytime.settings.v2"]["theme"], "dark");
    }

    #[test]
    fn clear_removes_app_data_and_legacy_keys() {
        let original = json!({"cytime.settings.v1": {}, "cytime.content.v1": {}, "other": "keep"});
        let next = apply_changes(&original, &json!({}), &[], true).unwrap();
        assert_eq!(next, json!({"other": "keep"}));
    }

    #[test]
    fn invalid_changes_do_not_mutate_the_original() {
        let original = json!({"cytime.content.v1": {"notepad": "keep"}});
        assert!(apply_changes(&original, &json!([]), &[], false).is_err());
        assert!(apply_changes(&original, &json!({"other": "bad"}), &[], false).is_err());
        assert_eq!(original["cytime.content.v1"]["notepad"], "keep");
    }
}
