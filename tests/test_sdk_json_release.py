"""SDK JSON loader validation preserves JSON data and rejects injected source."""
import json,unittest
from test_github_release import release
class SdkJson(unittest.TestCase):
    def test_sdk_json_module_retains_all_translations_and_only_the_sdk_footer(self):
        original=json.dumps({'cs':'Žluťoučký kůň','de':'Außentemperatur'},ensure_ascii=False)
        footer='\n\n//////////////////\n// WEBPACK FOOTER\n// module id = 2'
        mapped='module.exports = '+json.dumps(json.loads(original),separators=(',',':'),ensure_ascii=False)+footer
        release.validate_json_module(mapped,original,'./src/common/translations.json')
        for invalid in (mapped.replace('Außentemperatur','short'),mapped+'\nrunUnreviewed();','module.exports = {}'+footer):
            with self.subTest(value=invalid),self.assertRaises(ValueError):release.validate_json_module(invalid,original,'./src/common/translations.json')
