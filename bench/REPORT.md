# ajv benchmark suite: replacement versus ajv

Measured 2026-10-23T22:38:44.504Z on Node.js 24.18.0.

## Environment

- Node.js: 24.18.0 (V8 13.6.233.17-node.50)
- Replacement: @dsdenes/ajv-turbo 8.20.0 at commit 1bfc20b25dd96581b3783ae84546fb6e7e077c8a
- Benchmark suite: json-schema-benchmark at commit e9c884f9edd38438a150fef0e9a2a1173c0fcc50 (https://github.com/ebdrup/json-schema-benchmark)
- Cases: JSON-Schema-Test-Suite tests/draft7 and remotes at commit bcf1dc81ae099ade2a9642c672c06ee1af1bb489 (https://github.com/json-schema/JSON-Schema-Test-Suite)
- Machine: AMD Ryzen 9 5950X 16-Core Processor, 32 cores, x64, linux 7.0.0-38-generic, 94 GiB
- Procedure: Benchmark.js 2.1.4, Suite.run({async: false}), minTime 0s, maxTime 5s, minSamples 5; validate every document of the case per iteration

## Result

- Cases included: 193
- Documents verified: 695
- Verdict mismatches: 0
- Cases excluded (schema failed to compile): 52
- Aggregate: geometric mean of per-case throughput ratios (replacement / ajv) = **2.0214**
- Whole-suite throughput: ajv 17,633,158 documents/sec, replacement 36,296,101 documents/sec, ratio 2.058

## Per case

| Case | Documents | ajv (docs/sec) | Replacement (docs/sec) | Ratio |
|---|--:|--:|--:|--:|
| tests/draft7/additionalItems.json :: additionalItems as schema | 2 | 62,454,674 | 121,493,294 | 1.945 |
| tests/draft7/additionalItems.json :: array of items with no additionalItems | 5 | 214,656,213 | 343,359,934 | 1.600 |
| tests/draft7/additionalItems.json :: additionalItems are allowed by default | 1 | 107,421,613 | 114,458,437 | 1.066 |
| tests/draft7/additionalItems.json :: additionalItems should not look in applicators, invalid case | 1 | 40,084,345 | 86,236,546 | 2.151 |
| tests/draft7/additionalProperties.json :: additionalProperties being false does not allow other properties | 6 | 89,905,331 | 108,892,750 | 1.211 |
| tests/draft7/additionalProperties.json :: non-ASCII pattern with additionalProperties | 2 | 41,902,544 | 50,694,416 | 1.210 |
| tests/draft7/additionalProperties.json :: additionalProperties allows a schema which should validate | 3 | 25,340,988 | 107,642,917 | 4.248 |
| tests/draft7/additionalProperties.json :: additionalProperties can exist by itself | 2 | 19,291,350 | 101,059,921 | 5.239 |
| tests/draft7/additionalProperties.json :: additionalProperties are allowed by default | 1 | 134,124,902 | 136,091,515 | 1.015 |
| tests/draft7/additionalProperties.json :: additionalProperties should not look in applicators | 1 | 10,765,249 | 78,491,999 | 7.291 |
| tests/draft7/allOf.json :: allOf | 4 | 74,000,768 | 174,884,473 | 2.363 |
| tests/draft7/allOf.json :: allOf with base schema | 5 | 41,100,185 | 99,393,733 | 2.418 |
| tests/draft7/allOf.json :: allOf simple types | 2 | 95,859,580 | 177,770,065 | 1.854 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all true | 1 | 149,745,013 | 146,284,752 | 0.977 |
| tests/draft7/allOf.json :: allOf with boolean schemas, some false | 1 | 59,597,247 | 132,604,117 | 2.225 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all false | 1 | 61,200,212 | 133,427,417 | 2.180 |
| tests/draft7/allOf.json :: allOf with one empty schema | 1 | 149,026,895 | 148,301,854 | 0.995 |
| tests/draft7/allOf.json :: allOf with two empty schemas | 1 | 149,042,260 | 148,008,806 | 0.993 |
| tests/draft7/allOf.json :: allOf with the first empty schema | 2 | 115,260,571 | 231,764,247 | 2.011 |
| tests/draft7/allOf.json :: allOf with the last empty schema | 2 | 114,388,587 | 231,315,562 | 2.022 |
| tests/draft7/allOf.json :: nested allOf, to check validation semantics | 2 | 118,594,219 | 259,940,168 | 2.192 |
| tests/draft7/allOf.json :: allOf combined with anyOf, oneOf | 8 | 14,950,092 | 24,282,852 | 1.624 |
| tests/draft7/anyOf.json :: anyOf | 4 | 34,194,044 | 97,624,383 | 2.855 |
| tests/draft7/anyOf.json :: anyOf with base schema | 3 | 35,191,103 | 77,897,285 | 2.214 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all true | 1 | 148,602,135 | 151,098,325 | 1.017 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, some true | 1 | 154,374,699 | 149,068,306 | 0.966 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all false | 1 | 23,456,138 | 138,737,733 | 5.915 |
| tests/draft7/anyOf.json :: anyOf complex types | 4 | 50,119,411 | 199,266,562 | 3.976 |
| tests/draft7/anyOf.json :: anyOf with one empty schema | 2 | 302,525,459 | 267,758,610 | 0.885 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 44,085,469 | 248,613,871 | 5.639 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 44,665,206 | 154,748,221 | 3.465 |
| tests/draft7/boolean_schema.json :: boolean schema 'true' | 9 | 777,479,673 | 979,537,117 | 1.260 |
| tests/draft7/boolean_schema.json :: boolean schema 'false' | 9 | 72,949,379 | 505,271,969 | 6.926 |
| tests/draft7/const.json :: const validation | 3 | 102,612,556 | 222,460,922 | 2.168 |
| tests/draft7/const.json :: const with object | 4 | 20,769,031 | 27,076,879 | 1.304 |
| tests/draft7/const.json :: const with array | 3 | 24,422,657 | 36,522,056 | 1.495 |
| tests/draft7/const.json :: const with null | 2 | 119,115,278 | 257,294,174 | 2.160 |
| tests/draft7/const.json :: const with false does not match 0 | 3 | 109,026,044 | 349,576,170 | 3.206 |
| tests/draft7/const.json :: const with true does not match 1 | 3 | 109,551,479 | 341,595,973 | 3.118 |
| tests/draft7/const.json :: const with [false] does not match [0] | 3 | 42,072,823 | 61,443,840 | 1.460 |
| tests/draft7/const.json :: const with [true] does not match [1] | 3 | 40,942,553 | 59,777,518 | 1.460 |
| tests/draft7/const.json :: const with {"a": false} does not match {"a": 0} | 3 | 18,207,107 | 24,989,543 | 1.373 |
| tests/draft7/const.json :: const with {"a": true} does not match {"a": 1} | 3 | 17,909,684 | 24,876,299 | 1.389 |
| tests/draft7/const.json :: const with 0 does not match other zero-like types | 6 | 110,779,641 | 270,357,294 | 2.440 |
| tests/draft7/const.json :: const with 1 does not match true | 3 | 149,171,394 | 226,321,760 | 1.517 |
| tests/draft7/const.json :: const with -2.0 matches integer and float types | 5 | 126,331,760 | 376,417,107 | 2.980 |
| tests/draft7/const.json :: float and integers are equal up to 64-bit representation limits | 4 | 135,847,705 | 345,685,979 | 2.545 |
| tests/draft7/const.json :: nul characters in strings | 2 | 98,635,039 | 155,586,638 | 1.577 |
| tests/draft7/contains.json :: contains keyword validation | 6 | 29,073,038 | 251,199,111 | 8.640 |
| tests/draft7/contains.json :: contains keyword with const keyword | 3 | 21,070,465 | 216,529,640 | 10.276 |
| tests/draft7/contains.json :: contains keyword with boolean schema true | 2 | 110,609,729 | 204,963,664 | 1.853 |
| tests/draft7/contains.json :: contains keyword with boolean schema false | 3 | 70,018,608 | 236,367,702 | 3.376 |
| tests/draft7/contains.json :: items + contains | 4 | 12,766,587 | 17,758,121 | 1.391 |
| tests/draft7/default.json :: invalid type for default | 2 | 145,524,500 | 186,016,158 | 1.278 |
| tests/draft7/default.json :: invalid string value for default | 2 | 103,793,278 | 120,331,220 | 1.159 |
| tests/draft7/definitions.json :: valid definition | 1 | 1,845,988 | 43,921,843 | 23.793 |
| tests/draft7/definitions.json :: invalid definition | 1 | 1,844,438 | 32,850,370 | 17.811 |
| tests/draft7/dependencies.json :: dependencies | 7 | 185,388,415 | 325,974,625 | 1.758 |
| tests/draft7/dependencies.json :: dependencies with empty array | 3 | 396,142,429 | 407,442,968 | 1.029 |
| tests/draft7/dependencies.json :: multiple dependencies | 6 | 74,231,791 | 143,211,559 | 1.929 |
| tests/draft7/dependencies.json :: multiple dependencies subschema | 5 | 89,904,947 | 221,440,643 | 2.463 |
| tests/draft7/dependencies.json :: dependencies with boolean subschemas | 4 | 101,915,130 | 253,126,796 | 2.484 |
| tests/draft7/dependencies.json :: dependencies with escaped characters | 7 | 29,469,560 | 39,405,974 | 1.337 |
| tests/draft7/enum.json :: simple enum validation | 2 | 101,663,462 | 237,249,159 | 2.334 |
| tests/draft7/enum.json :: heterogeneous enum validation | 5 | 18,448,044 | 31,352,540 | 1.700 |
| tests/draft7/enum.json :: heterogeneous enum-with-null validation | 3 | 138,481,291 | 220,371,379 | 1.591 |
| tests/draft7/enum.json :: enums in properties | 6 | 85,526,685 | 210,428,993 | 2.460 |
| tests/draft7/enum.json :: enum with escaped characters | 3 | 155,623,723 | 301,893,668 | 1.940 |
| tests/draft7/enum.json :: enum with false does not match 0 | 3 | 111,037,162 | 348,779,523 | 3.141 |
| tests/draft7/enum.json :: enum with true does not match 1 | 3 | 112,205,486 | 350,396,954 | 3.123 |
| tests/draft7/enum.json :: enum with 0 does not match false | 3 | 151,904,100 | 237,721,661 | 1.565 |
| tests/draft7/enum.json :: enum with 1 does not match true | 3 | 148,799,116 | 226,237,840 | 1.520 |
| tests/draft7/enum.json :: nul characters in strings | 2 | 95,595,817 | 154,511,882 | 1.616 |
| tests/draft7/exclusiveMaximum.json :: exclusiveMaximum validation | 4 | 121,420,821 | 303,392,245 | 2.499 |
| tests/draft7/exclusiveMinimum.json :: exclusiveMinimum validation | 4 | 119,480,734 | 282,887,218 | 2.368 |
| tests/draft7/if-then-else.json :: if and then without else | 3 | 105,713,317 | 228,356,569 | 2.160 |
| tests/draft7/if-then-else.json :: if and else without then | 3 | 80,924,228 | 159,231,822 | 1.968 |
| tests/draft7/if-then-else.json :: validate against correct branch, then vs else | 4 | 60,166,030 | 175,027,715 | 2.909 |
| tests/draft7/if-then-else.json :: if with boolean schema true | 2 | 120,426,659 | 227,281,969 | 1.887 |
| tests/draft7/if-then-else.json :: if with boolean schema false | 2 | 117,249,768 | 229,621,863 | 1.958 |
| tests/draft7/if-then-else.json :: if appears at the end when serialized (keyword processing sequence) | 4 | 62,890,676 | 99,429,884 | 1.581 |
| tests/draft7/infinite-loop-detection.json :: evaluating the same schema location against the same data location twice is not a sign of an infinite loop | 2 | 71,008,130 | 112,079,295 | 1.578 |
| tests/draft7/items.json :: a schema given for items | 4 | 122,461,861 | 216,871,476 | 1.771 |
| tests/draft7/items.json :: an array of schemas for items | 6 | 199,156,010 | 275,008,099 | 1.381 |
| tests/draft7/items.json :: items with boolean schema (true) | 2 | 287,105,111 | 295,859,154 | 1.030 |
| tests/draft7/items.json :: items with boolean schema (false) | 2 | 82,881,980 | 172,985,425 | 2.087 |
| tests/draft7/items.json :: items with boolean schemas | 3 | 56,336,198 | 103,120,694 | 1.830 |
| tests/draft7/items.json :: items and subitems | 6 | 23,063,507 | 69,765,903 | 3.025 |
| tests/draft7/items.json :: nested items | 3 | 17,524,264 | 52,157,043 | 2.976 |
| tests/draft7/maximum.json :: maximum validation | 4 | 88,348,585 | 297,359,572 | 3.366 |
| tests/draft7/maximum.json :: maximum validation with unsigned integer | 4 | 170,705,368 | 286,878,022 | 1.681 |
| tests/draft7/maxItems.json :: maxItems validation | 4 | 188,841,842 | 323,050,021 | 1.711 |
| tests/draft7/maxLength.json :: maxLength validation | 5 | 148,058,727 | 180,861,986 | 1.222 |
| tests/draft7/maxProperties.json :: maxProperties validation | 6 | 125,688,615 | 176,842,378 | 1.407 |
| tests/draft7/maxProperties.json :: maxProperties = 0 means the object is empty | 2 | 67,799,669 | 101,969,779 | 1.504 |
| tests/draft7/minimum.json :: minimum validation | 4 | 165,158,131 | 301,631,020 | 1.826 |
| tests/draft7/minimum.json :: minimum validation with signed integer | 7 | 182,815,873 | 375,973,182 | 2.057 |
| tests/draft7/minItems.json :: minItems validation | 4 | 189,156,481 | 323,442,396 | 1.710 |
| tests/draft7/minLength.json :: minLength validation | 5 | 118,760,473 | 185,526,424 | 1.562 |
| tests/draft7/minProperties.json :: minProperties validation | 6 | 134,041,932 | 183,385,736 | 1.368 |
| tests/draft7/multipleOf.json :: by int | 3 | 113,692,501 | 168,269,570 | 1.480 |
| tests/draft7/multipleOf.json :: by number | 3 | 95,995,477 | 138,547,735 | 1.443 |
| tests/draft7/multipleOf.json :: by small number | 2 | 74,599,958 | 116,150,247 | 1.557 |
| tests/draft7/multipleOf.json :: invalid instance should not raise error when float division = inf | 1 | 14,389,351 | 15,273,635 | 1.061 |
| tests/draft7/not.json :: not | 2 | 79,734,911 | 242,193,616 | 3.037 |
| tests/draft7/not.json :: not multiple types | 3 | 74,465,098 | 279,141,287 | 3.749 |
| tests/draft7/not.json :: not more complex schema | 3 | 86,350,716 | 254,524,605 | 2.948 |
| tests/draft7/not.json :: forbidden property | 2 | 91,615,411 | 116,827,040 | 1.275 |
| tests/draft7/not.json :: not with boolean schema true | 1 | 44,095,862 | 132,204,028 | 2.998 |
| tests/draft7/not.json :: not with boolean schema false | 1 | 149,317,860 | 156,957,223 | 1.051 |
| tests/draft7/oneOf.json :: oneOf | 4 | 34,938,110 | 112,803,446 | 3.229 |
| tests/draft7/oneOf.json :: oneOf with base schema | 3 | 47,100,674 | 78,359,856 | 1.664 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all true | 1 | 53,079,577 | 134,945,612 | 2.542 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, one true | 1 | 29,449,302 | 156,547,233 | 5.316 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, more than one true | 1 | 54,796,261 | 140,305,238 | 2.560 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all false | 1 | 20,043,606 | 140,099,516 | 6.990 |
| tests/draft7/oneOf.json :: oneOf complex types | 4 | 39,801,748 | 137,386,100 | 3.452 |
| tests/draft7/oneOf.json :: oneOf with empty schema | 2 | 69,115,607 | 248,316,977 | 3.593 |
| tests/draft7/oneOf.json :: oneOf with required | 4 | 31,558,957 | 149,366,985 | 4.733 |
| tests/draft7/oneOf.json :: oneOf with missing optional property | 4 | 38,645,613 | 165,886,786 | 4.293 |
| tests/draft7/oneOf.json :: nested oneOf, to check validation semantics | 2 | 50,203,897 | 240,658,118 | 4.794 |
| tests/draft7/optional/bignum.json :: integer | 1 | 27,859,753 | 29,064,247 | 1.043 |
| tests/draft7/optional/bignum.json :: number | 1 | 128,351,776 | 126,680,023 | 0.987 |
| tests/draft7/optional/bignum.json :: integer | 1 | 28,213,378 | 29,816,183 | 1.057 |
| tests/draft7/optional/bignum.json :: number | 1 | 131,374,686 | 136,753,269 | 1.041 |
| tests/draft7/optional/bignum.json :: string | 1 | 63,715,138 | 129,762,834 | 2.037 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 121,233,704 | 89,046,297 | 0.735 |
| tests/draft7/optional/bignum.json :: float comparison with high precision | 1 | 25,994,923 | 105,557,102 | 4.061 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 71,365,424 | 97,577,506 | 1.367 |
| tests/draft7/optional/bignum.json :: float comparison with high precision on negative numbers | 1 | 51,272,061 | 108,834,397 | 2.123 |
| tests/draft7/optional/content.json :: validation of string-encoded content based on media type | 3 | 364,825,737 | 274,901,285 | 0.754 |
| tests/draft7/optional/content.json :: validation of binary string-encoding | 3 | 396,483,527 | 410,388,168 | 1.035 |
| tests/draft7/optional/content.json :: validation of binary-encoded media type documents | 4 | 544,187,223 | 514,775,671 | 0.946 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex $ does not match trailing newline | 2 | 52,989,746 | 60,800,041 | 1.147 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex converts \t to horizontal tab | 2 | 52,862,732 | 60,080,120 | 1.137 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and upper letter | 2 | 50,317,918 | 60,397,338 | 1.200 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and lower letter | 2 | 33,741,910 | 49,588,811 | 1.470 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \d matches ascii digits only | 3 | 50,097,412 | 64,296,007 | 1.283 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \D matches everything but ascii digits | 3 | 56,438,719 | 61,792,309 | 1.095 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \w matches ascii letters only | 2 | 53,541,207 | 61,555,119 | 1.150 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \W matches everything but ascii letters | 2 | 53,551,751 | 62,269,019 | 1.163 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \s matches whitespace | 11 | 64,363,229 | 67,627,243 | 1.051 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \S matches everything but whitespace | 11 | 49,924,072 | 71,359,993 | 1.429 |
| tests/draft7/optional/float-overflow.json :: all integers are multiples of 0.5, if overflow is handled | 1 | 14,079,705 | 15,029,088 | 1.067 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: pattern | 7 | 53,584,274 | 65,679,471 | 1.226 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: patternProperties | 5 | 13,753,704 | 32,811,627 | 2.386 |
| tests/draft7/pattern.json :: pattern validation | 8 | 104,886,786 | 168,057,296 | 1.602 |
| tests/draft7/pattern.json :: pattern is not anchored | 1 | 48,162,251 | 38,270,783 | 0.795 |
| tests/draft7/patternProperties.json :: patternProperties validates properties matching a regex | 7 | 12,520,417 | 56,653,836 | 4.525 |
| tests/draft7/patternProperties.json :: multiple simultaneous patternProperties are validated | 6 | 11,075,142 | 26,198,280 | 2.366 |
| tests/draft7/patternProperties.json :: regexes are not anchored by default and are case sensitive | 4 | 12,497,142 | 20,591,548 | 1.648 |
| tests/draft7/patternProperties.json :: patternProperties with boolean schemas | 5 | 9,067,724 | 48,822,199 | 5.384 |
| tests/draft7/properties.json :: object properties validation | 6 | 129,903,832 | 288,108,604 | 2.218 |
| tests/draft7/properties.json :: properties with boolean schema | 4 | 101,878,736 | 246,875,490 | 2.423 |
| tests/draft7/properties.json :: properties with escaped characters | 2 | 60,401,998 | 140,450,783 | 2.325 |
| tests/draft7/propertyNames.json :: propertyNames validation | 6 | 79,063,254 | 77,228,918 | 0.977 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema true | 2 | 255,388,289 | 296,700,659 | 1.162 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema false | 2 | 50,340,459 | 128,669,753 | 2.556 |
| tests/draft7/ref.json :: root pointer ref | 4 | 38,470,557 | 97,479,591 | 2.534 |
| tests/draft7/ref.json :: relative pointer ref to object | 2 | 90,828,569 | 180,697,684 | 1.989 |
| tests/draft7/ref.json :: relative pointer ref to array | 2 | 92,720,906 | 152,802,677 | 1.648 |
| tests/draft7/ref.json :: escaped pointer ref | 6 | 95,197,975 | 204,792,838 | 2.151 |
| tests/draft7/ref.json :: nested refs | 2 | 118,064,799 | 235,201,629 | 1.992 |
| tests/draft7/ref.json :: ref overrides any sibling keywords | 3 | 83,935,736 | 196,945,186 | 2.346 |
| tests/draft7/ref.json :: remote ref, containing refs itself | 2 | 4,613,063 | 57,130,940 | 12.385 |
| tests/draft7/ref.json :: property named $ref that is not a reference | 2 | 41,567,655 | 157,616,733 | 3.792 |
| tests/draft7/ref.json :: property named $ref, containing an actual $ref | 2 | 86,819,487 | 197,248,411 | 2.272 |
| tests/draft7/ref.json :: $ref to boolean schema true | 1 | 151,297,099 | 153,166,399 | 1.012 |
| tests/draft7/ref.json :: $ref to boolean schema false | 1 | 62,975,632 | 137,197,108 | 2.179 |
| tests/draft7/ref.json :: refs with quote | 2 | 95,007,670 | 182,395,992 | 1.920 |
| tests/draft7/ref.json :: naive replacement of $ref with its destination is not correct | 2 | 26,431,896 | 36,851,853 | 1.394 |
| tests/draft7/refRemote.json :: remote ref | 2 | 111,763,620 | 230,671,576 | 2.064 |
| tests/draft7/required.json :: required validation | 5 | 180,649,013 | 348,620,177 | 1.930 |
| tests/draft7/required.json :: required default validation | 1 | 159,201,170 | 158,752,768 | 0.997 |
| tests/draft7/required.json :: required with empty array | 1 | 151,553,096 | 117,212,036 | 0.773 |
| tests/draft7/required.json :: required with escaped characters | 2 | 38,376,661 | 151,251,123 | 3.941 |
| tests/draft7/type.json :: integer type matches integers | 9 | 88,271,040 | 217,028,930 | 2.459 |
| tests/draft7/type.json :: number type matches numbers | 9 | 120,047,570 | 389,455,938 | 3.244 |
| tests/draft7/type.json :: string type matches strings | 9 | 125,144,759 | 388,548,295 | 3.105 |
| tests/draft7/type.json :: object type matches objects | 7 | 91,112,149 | 357,813,946 | 3.927 |
| tests/draft7/type.json :: array type matches arrays | 7 | 89,979,576 | 347,081,093 | 3.857 |
| tests/draft7/type.json :: boolean type matches booleans | 10 | 102,530,492 | 383,733,376 | 3.743 |
| tests/draft7/type.json :: null type matches only the null object | 10 | 91,231,294 | 384,817,434 | 4.218 |
| tests/draft7/type.json :: multiple types can be specified in an array | 7 | 96,273,668 | 243,031,551 | 2.524 |
| tests/draft7/type.json :: type as array with one item | 2 | 105,569,922 | 239,009,146 | 2.264 |
| tests/draft7/type.json :: type: array or object | 5 | 112,751,629 | 332,272,659 | 2.947 |
| tests/draft7/type.json :: type: array, object or null | 5 | 161,697,081 | 348,174,222 | 2.153 |
| tests/draft7/uniqueItems.json :: uniqueItems validation | 23 | 15,912,223 | 25,308,136 | 1.590 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items | 8 | 33,005,943 | 54,093,698 | 1.639 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items and additionalItems=false | 5 | 45,437,211 | 98,173,111 | 2.161 |
| tests/draft7/uniqueItems.json :: uniqueItems=false validation | 15 | 1,213,564,927 | 773,546,078 | 0.637 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items | 8 | 288,558,429 | 309,182,078 | 1.071 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items and additionalItems=false | 5 | 187,830,145 | 253,950,030 | 1.352 |

## Excluded cases

Schemas that a validator could not compile carry no comparable verdict.

- tests/draft7/additionalItems.json :: items is schema, no additionalItems (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/additionalItems.json :: additionalItems as false without items (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/additionalItems.json :: additionalItems should not look in applicators, valid case (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/format.json :: validation of e-mail addresses (ajv: unknown format "email" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IDN e-mail addresses (ajv: unknown format "idn-email" ignored in schema at path "#")
- tests/draft7/format.json :: validation of regexes (ajv: unknown format "regex" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IP addresses (ajv: unknown format "ipv4" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IPv6 addresses (ajv: unknown format "ipv6" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IDN hostnames (ajv: unknown format "idn-hostname" ignored in schema at path "#")
- tests/draft7/format.json :: validation of hostnames (ajv: unknown format "hostname" ignored in schema at path "#")
- tests/draft7/format.json :: validation of date strings (ajv: unknown format "date" ignored in schema at path "#")
- tests/draft7/format.json :: validation of date-time strings (ajv: unknown format "date-time" ignored in schema at path "#")
- tests/draft7/format.json :: validation of time strings (ajv: unknown format "time" ignored in schema at path "#")
- tests/draft7/format.json :: validation of JSON pointers (ajv: unknown format "json-pointer" ignored in schema at path "#")
- tests/draft7/format.json :: validation of relative JSON pointers (ajv: unknown format "relative-json-pointer" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IRIs (ajv: unknown format "iri" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IRI references (ajv: unknown format "iri-reference" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URIs (ajv: unknown format "uri" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URI references (ajv: unknown format "uri-reference" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URI templates (ajv: unknown format "uri-template" ignored in schema at path "#")
- tests/draft7/if-then-else.json :: ignore if without then or else (ajv: strict mode: "if" without "then" and "else" is ignored)
- tests/draft7/if-then-else.json :: ignore then without if (ajv: strict mode: "then" without "if" is ignored)
- tests/draft7/if-then-else.json :: ignore else without if (ajv: strict mode: "else" without "if" is ignored)
- tests/draft7/if-then-else.json :: non-interference across combined schemas (ajv: strict mode: "if" without "then" and "else" is ignored)
- tests/draft7/optional/format/date-time.json :: validation of date-time strings (ajv: unknown format "date-time" ignored in schema at path "#")
- tests/draft7/optional/format/date.json :: validation of date strings (ajv: unknown format "date" ignored in schema at path "#")
- tests/draft7/optional/format/email.json :: validation of e-mail addresses (ajv: unknown format "email" ignored in schema at path "#")
- tests/draft7/optional/format/hostname.json :: validation of host names (ajv: unknown format "hostname" ignored in schema at path "#")
- tests/draft7/optional/format/idn-email.json :: validation of an internationalized e-mail addresses (ajv: unknown format "idn-email" ignored in schema at path "#")
- tests/draft7/optional/format/idn-hostname.json :: validation of internationalized host names (ajv: unknown format "idn-hostname" ignored in schema at path "#")
- tests/draft7/optional/format/ipv4.json :: validation of IP addresses (ajv: unknown format "ipv4" ignored in schema at path "#")
- tests/draft7/optional/format/ipv6.json :: validation of IPv6 addresses (ajv: unknown format "ipv6" ignored in schema at path "#")
- tests/draft7/optional/format/iri-reference.json :: validation of IRI References (ajv: unknown format "iri-reference" ignored in schema at path "#")
- tests/draft7/optional/format/iri.json :: validation of IRIs (ajv: unknown format "iri" ignored in schema at path "#")
- tests/draft7/optional/format/json-pointer.json :: validation of JSON-pointers (JSON String Representation) (ajv: unknown format "json-pointer" ignored in schema at path "#")
- tests/draft7/optional/format/regex.json :: validation of regular expressions (ajv: unknown format "regex" ignored in schema at path "#")
- tests/draft7/optional/format/relative-json-pointer.json :: validation of Relative JSON Pointers (RJP) (ajv: unknown format "relative-json-pointer" ignored in schema at path "#")
- tests/draft7/optional/format/time.json :: validation of time strings (ajv: unknown format "time" ignored in schema at path "#")
- tests/draft7/optional/format/uri-reference.json :: validation of URI References (ajv: unknown format "uri-reference" ignored in schema at path "#")
- tests/draft7/optional/format/uri-template.json :: format: uri-template (ajv: unknown format "uri-template" ignored in schema at path "#")
- tests/draft7/optional/format/uri.json :: validation of URIs (ajv: unknown format "uri" ignored in schema at path "#")
- tests/draft7/properties.json :: properties, patternProperties, additionalProperties interaction (ajv: strict mode: property foo matches pattern f.o (use allowMatchingProperties))
- tests/draft7/ref.json :: Recursive references between schemas (ajv: can't resolve reference node from id #)
- tests/draft7/ref.json :: Location-independent identifier (ajv: can't resolve reference #foo from id #)
- tests/draft7/ref.json :: Location-independent identifier with absolute URI (ajv: can't resolve reference http://localhost:1234/bar#foo from id #)
- tests/draft7/ref.json :: Location-independent identifier with base URI change in subschema (ajv: can't resolve reference http://localhost:1234/nested.json#foo from id #)
- tests/draft7/refRemote.json :: fragment within remote ref (ajv: strict mode: unknown keyword: "integer")
- tests/draft7/refRemote.json :: ref within remote ref (ajv: strict mode: unknown keyword: "integer")
- tests/draft7/refRemote.json :: base URI change (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: base URI change - change folder (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: base URI change - change folder in subschema (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: root ref in remote ref (ajv: can't resolve reference name.json#/definitions/orNull from id #)
