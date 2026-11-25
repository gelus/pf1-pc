# helpers for the hand patches of feats and traits: the forms written again and again
def T(v, kind=None): return {"value": v, "type": kind} if kind else v
def once(why, n=1, per='day', label='uses'): return {"charges": {"total": n, "current": n, "per": per, "label": label}, "descriptionOnly": "no path: " + why}
def nopath(why): return {"descriptionOnly": "no path: " + why}
def note(why): return {"descriptionOnly": why}
def toggle(adj, why=None):
    d = {"adjustments": adj, "active": False, "examples": [{"expect": {}}]}
    if why: d["descriptionOnly"] = why
    return d
def var(adj, why=None, expect=None):
    d = {"adjustments": adj, "examples": [{"expect": expect or {}}]}
    if why: d["descriptionOnly"] = why
    return d
def uses(feature, n, why=None):
    d = {"adjustments": {f"extraUses.{feature}": n}, "examples": [{"expect": {}}]}
    if why: d["descriptionOnly"] = why
    return d
def pick_uses(cid, label, n):
    return {"adjustments": {"extraUses.{choice:" + cid + "}": n}, "choices": [{"id": cid, "kind": "text", "label": label}], "examples": [{"choices": {cid: "the feature"}, "expect": {}}]}
def sla(spells, ability='cha', cl=None):
    d = {"spells": [{"name": n, **({"uses": u} if u else {})} for n, u in spells], "ability": ability}
    if cl: d["casterLevel"] = cl
    return {"sla": d}
def cantrip(cid, label, uses=1, ability='cha'):
    return {"choices": [{"id": cid, "kind": "text", "label": label}],
            "adjustments": {f"spellLikeAbilities.{cid}": {"name": label.split(':')[0], "ability": ability, "casterLevel": 0, "concentration": 0, "spells": [{"perDay": {"total": 0, "current": 0}, "spells": [{"name": "{choice:" + cid + "}", "uses": {"total": uses, "current": uses, "per": "day", "label": "per day"}}]}]}, f"spellLikeAbilities.{cid}.casterLevel": "{level}"},
            "examples": [{"choices": {cid: "Light"}, "expect": {}}]}
def bite(damage='1d4', secondary=True, name='Bite', dtype='P'):
    return {"adjustments": {"melee": [{"type": "natural", "name": name, "damage": damage, "damageType": [dtype], "toHitAbility": "str", "damageAbility": "str", **({"secondary": True} if secondary else {})}]}, "shownIn": "specialAttack", "examples": [{"expect": {}}]}
def both_damage(sit, v, kind=None):
    return {f"melee.*.damageBonus[{sit}]": T(v, kind), f"ranged.*.damageBonus[{sit}]": T(v, kind)}
def dump(name, P):
    import json
    json.dump(P, open(name, 'w'), indent=1, ensure_ascii=False)
