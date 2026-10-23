# ajv benchmark suite: replacement versus ajv

Measured 2026-10-23T02:33:34.538Z on Node.js 24.18.0.

## Environment

- Node.js: 24.18.0 (V8 13.6.233.17-node.50)
- Replacement: ajv 8.20.0 at commit 62add772a51d76facc5f9826b7f15509bbb3eae8 (working tree)
- Benchmark suite: json-schema-benchmark at commit e9c884f9edd38438a150fef0e9a2a1173c0fcc50 (https://github.com/ebdrup/json-schema-benchmark)
- Cases: JSON-Schema-Test-Suite tests/draft7 and remotes at commit bcf1dc81ae099ade2a9642c672c06ee1af1bb489 (https://github.com/json-schema/JSON-Schema-Test-Suite)
- Machine: AMD Ryzen 9 5950X 16-Core Processor, 32 cores, x64, linux 7.0.0-38-generic, 94 GiB
- Procedure: Benchmark.js 2.1.4, Suite.run({async: false}), minTime 0s, maxTime 5s, minSamples 5; validate every document of the case per iteration

## Result

- Cases included: 193
- Documents verified: 695
- Verdict mismatches: 0
- Cases excluded (schema failed to compile): 52
- Aggregate: geometric mean of per-case throughput ratios (replacement / ajv) = **1.9876**
- Whole-suite throughput: ajv 18,910,595 documents/sec, replacement 38,511,788 documents/sec, ratio 2.037

## Per case

| Case | Documents | ajv (docs/sec) | Replacement (docs/sec) | Ratio |
|---|--:|--:|--:|--:|
| tests/draft7/additionalItems.json :: additionalItems as schema | 2 | 68,393,310 | 128,082,465 | 1.873 |
| tests/draft7/additionalItems.json :: array of items with no additionalItems | 5 | 224,313,948 | 352,989,493 | 1.574 |
| tests/draft7/additionalItems.json :: additionalItems are allowed by default | 1 | 115,079,636 | 119,260,034 | 1.036 |
| tests/draft7/additionalItems.json :: additionalItems should not look in applicators, invalid case | 1 | 41,639,329 | 91,053,147 | 2.187 |
| tests/draft7/additionalProperties.json :: additionalProperties being false does not allow other properties | 6 | 91,217,168 | 114,523,523 | 1.256 |
| tests/draft7/additionalProperties.json :: non-ASCII pattern with additionalProperties | 2 | 44,026,769 | 51,472,035 | 1.169 |
| tests/draft7/additionalProperties.json :: additionalProperties allows a schema which should validate | 3 | 26,138,741 | 113,850,916 | 4.356 |
| tests/draft7/additionalProperties.json :: additionalProperties can exist by itself | 2 | 20,175,986 | 109,040,116 | 5.404 |
| tests/draft7/additionalProperties.json :: additionalProperties are allowed by default | 1 | 141,630,841 | 147,915,347 | 1.044 |
| tests/draft7/additionalProperties.json :: additionalProperties should not look in applicators | 1 | 11,026,364 | 80,330,656 | 7.285 |
| tests/draft7/allOf.json :: allOf | 4 | 75,224,813 | 172,966,311 | 2.299 |
| tests/draft7/allOf.json :: allOf with base schema | 5 | 42,313,985 | 103,659,190 | 2.450 |
| tests/draft7/allOf.json :: allOf simple types | 2 | 95,882,470 | 185,526,252 | 1.935 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all true | 1 | 152,979,296 | 148,092,117 | 0.968 |
| tests/draft7/allOf.json :: allOf with boolean schemas, some false | 1 | 62,631,926 | 136,719,024 | 2.183 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all false | 1 | 63,252,434 | 138,255,440 | 2.186 |
| tests/draft7/allOf.json :: allOf with one empty schema | 1 | 153,440,968 | 148,217,428 | 0.966 |
| tests/draft7/allOf.json :: allOf with two empty schemas | 1 | 143,642,049 | 155,977,828 | 1.086 |
| tests/draft7/allOf.json :: allOf with the first empty schema | 2 | 110,876,756 | 224,658,493 | 2.026 |
| tests/draft7/allOf.json :: allOf with the last empty schema | 2 | 114,473,483 | 219,658,715 | 1.919 |
| tests/draft7/allOf.json :: nested allOf, to check validation semantics | 2 | 117,376,847 | 238,145,752 | 2.029 |
| tests/draft7/allOf.json :: allOf combined with anyOf, oneOf | 8 | 14,936,962 | 24,567,209 | 1.645 |
| tests/draft7/anyOf.json :: anyOf | 4 | 53,201,659 | 118,906,418 | 2.235 |
| tests/draft7/anyOf.json :: anyOf with base schema | 3 | 39,348,852 | 79,208,341 | 2.013 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all true | 1 | 140,447,801 | 138,224,762 | 0.984 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, some true | 1 | 145,128,562 | 148,487,478 | 1.023 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all false | 1 | 23,728,868 | 135,169,416 | 5.696 |
| tests/draft7/anyOf.json :: anyOf complex types | 4 | 49,686,797 | 193,706,149 | 3.899 |
| tests/draft7/anyOf.json :: anyOf with one empty schema | 2 | 309,099,766 | 269,887,847 | 0.873 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 46,538,096 | 249,930,547 | 5.370 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 46,695,552 | 256,441,817 | 5.492 |
| tests/draft7/boolean_schema.json :: boolean schema 'true' | 9 | 934,245,338 | 959,819,282 | 1.027 |
| tests/draft7/boolean_schema.json :: boolean schema 'false' | 9 | 76,800,216 | 505,628,783 | 6.584 |
| tests/draft7/const.json :: const validation | 3 | 103,525,337 | 223,378,452 | 2.158 |
| tests/draft7/const.json :: const with object | 4 | 17,927,215 | 25,279,521 | 1.410 |
| tests/draft7/const.json :: const with array | 3 | 23,866,500 | 34,869,956 | 1.461 |
| tests/draft7/const.json :: const with null | 2 | 110,352,294 | 269,211,495 | 2.440 |
| tests/draft7/const.json :: const with false does not match 0 | 3 | 106,402,445 | 269,591,234 | 2.534 |
| tests/draft7/const.json :: const with true does not match 1 | 3 | 58,588,060 | 265,907,121 | 4.539 |
| tests/draft7/const.json :: const with [false] does not match [0] | 3 | 39,993,228 | 61,643,751 | 1.541 |
| tests/draft7/const.json :: const with [true] does not match [1] | 3 | 40,514,656 | 59,334,528 | 1.465 |
| tests/draft7/const.json :: const with {"a": false} does not match {"a": 0} | 3 | 15,354,461 | 17,430,397 | 1.135 |
| tests/draft7/const.json :: const with {"a": true} does not match {"a": 1} | 3 | 16,246,562 | 22,621,397 | 1.392 |
| tests/draft7/const.json :: const with 0 does not match other zero-like types | 6 | 112,515,427 | 268,348,084 | 2.385 |
| tests/draft7/const.json :: const with 1 does not match true | 3 | 153,776,607 | 229,320,523 | 1.491 |
| tests/draft7/const.json :: const with -2.0 matches integer and float types | 5 | 127,242,462 | 365,357,248 | 2.871 |
| tests/draft7/const.json :: float and integers are equal up to 64-bit representation limits | 4 | 136,788,075 | 345,573,694 | 2.526 |
| tests/draft7/const.json :: nul characters in strings | 2 | 102,229,883 | 157,068,848 | 1.536 |
| tests/draft7/contains.json :: contains keyword validation | 6 | 30,461,239 | 252,708,810 | 8.296 |
| tests/draft7/contains.json :: contains keyword with const keyword | 3 | 20,431,514 | 217,977,933 | 10.669 |
| tests/draft7/contains.json :: contains keyword with boolean schema true | 2 | 108,145,896 | 198,941,763 | 1.840 |
| tests/draft7/contains.json :: contains keyword with boolean schema false | 3 | 61,654,283 | 224,053,160 | 3.634 |
| tests/draft7/contains.json :: items + contains | 4 | 12,839,495 | 17,747,614 | 1.382 |
| tests/draft7/default.json :: invalid type for default | 2 | 146,617,731 | 185,383,999 | 1.264 |
| tests/draft7/default.json :: invalid string value for default | 2 | 103,798,779 | 118,691,931 | 1.143 |
| tests/draft7/definitions.json :: valid definition | 1 | 1,923,317 | 43,977,839 | 22.866 |
| tests/draft7/definitions.json :: invalid definition | 1 | 1,945,339 | 33,328,439 | 17.132 |
| tests/draft7/dependencies.json :: dependencies | 7 | 189,662,577 | 358,673,215 | 1.891 |
| tests/draft7/dependencies.json :: dependencies with empty array | 3 | 417,891,969 | 333,127,390 | 0.797 |
| tests/draft7/dependencies.json :: multiple dependencies | 6 | 52,914,031 | 125,648,778 | 2.375 |
| tests/draft7/dependencies.json :: multiple dependencies subschema | 5 | 85,754,181 | 219,680,639 | 2.562 |
| tests/draft7/dependencies.json :: dependencies with boolean subschemas | 4 | 101,990,915 | 246,641,303 | 2.418 |
| tests/draft7/dependencies.json :: dependencies with escaped characters | 7 | 35,367,224 | 63,243,978 | 1.788 |
| tests/draft7/enum.json :: simple enum validation | 2 | 119,345,057 | 256,059,756 | 2.146 |
| tests/draft7/enum.json :: heterogeneous enum validation | 5 | 18,802,693 | 32,077,569 | 1.706 |
| tests/draft7/enum.json :: heterogeneous enum-with-null validation | 3 | 145,340,379 | 224,194,570 | 1.543 |
| tests/draft7/enum.json :: enums in properties | 6 | 84,818,555 | 212,171,437 | 2.501 |
| tests/draft7/enum.json :: enum with escaped characters | 3 | 155,075,039 | 305,165,889 | 1.968 |
| tests/draft7/enum.json :: enum with false does not match 0 | 3 | 111,711,808 | 345,679,929 | 3.094 |
| tests/draft7/enum.json :: enum with true does not match 1 | 3 | 112,067,190 | 353,391,765 | 3.153 |
| tests/draft7/enum.json :: enum with 0 does not match false | 3 | 148,526,346 | 237,145,292 | 1.597 |
| tests/draft7/enum.json :: enum with 1 does not match true | 3 | 151,326,791 | 238,156,249 | 1.574 |
| tests/draft7/enum.json :: nul characters in strings | 2 | 100,838,584 | 157,305,744 | 1.560 |
| tests/draft7/exclusiveMaximum.json :: exclusiveMaximum validation | 4 | 127,137,247 | 309,803,082 | 2.437 |
| tests/draft7/exclusiveMinimum.json :: exclusiveMinimum validation | 4 | 126,267,140 | 288,821,568 | 2.287 |
| tests/draft7/if-then-else.json :: if and then without else | 3 | 105,759,178 | 231,704,235 | 2.191 |
| tests/draft7/if-then-else.json :: if and else without then | 3 | 78,332,609 | 158,451,857 | 2.023 |
| tests/draft7/if-then-else.json :: validate against correct branch, then vs else | 4 | 60,390,771 | 175,408,824 | 2.905 |
| tests/draft7/if-then-else.json :: if with boolean schema true | 2 | 122,877,760 | 235,964,229 | 1.920 |
| tests/draft7/if-then-else.json :: if with boolean schema false | 2 | 117,797,228 | 229,549,575 | 1.949 |
| tests/draft7/if-then-else.json :: if appears at the end when serialized (keyword processing sequence) | 4 | 62,517,614 | 99,428,859 | 1.590 |
| tests/draft7/infinite-loop-detection.json :: evaluating the same schema location against the same data location twice is not a sign of an infinite loop | 2 | 72,187,915 | 114,575,608 | 1.587 |
| tests/draft7/items.json :: a schema given for items | 4 | 125,003,307 | 221,782,695 | 1.774 |
| tests/draft7/items.json :: an array of schemas for items | 6 | 197,049,380 | 272,547,856 | 1.383 |
| tests/draft7/items.json :: items with boolean schema (true) | 2 | 292,623,682 | 295,616,722 | 1.010 |
| tests/draft7/items.json :: items with boolean schema (false) | 2 | 84,159,784 | 199,024,856 | 2.365 |
| tests/draft7/items.json :: items with boolean schemas | 3 | 139,249,784 | 256,360,625 | 1.841 |
| tests/draft7/items.json :: items and subitems | 6 | 34,555,853 | 70,592,309 | 2.043 |
| tests/draft7/items.json :: nested items | 3 | 17,955,020 | 63,648,312 | 3.545 |
| tests/draft7/maximum.json :: maximum validation | 4 | 182,263,968 | 314,872,492 | 1.728 |
| tests/draft7/maximum.json :: maximum validation with unsigned integer | 4 | 173,108,214 | 297,708,355 | 1.720 |
| tests/draft7/maxItems.json :: maxItems validation | 4 | 199,039,332 | 331,992,741 | 1.668 |
| tests/draft7/maxLength.json :: maxLength validation | 5 | 147,566,835 | 178,674,858 | 1.211 |
| tests/draft7/maxProperties.json :: maxProperties validation | 6 | 98,958,643 | 120,498,958 | 1.218 |
| tests/draft7/maxProperties.json :: maxProperties = 0 means the object is empty | 2 | 58,443,619 | 80,026,718 | 1.369 |
| tests/draft7/minimum.json :: minimum validation | 4 | 176,703,562 | 314,065,319 | 1.777 |
| tests/draft7/minimum.json :: minimum validation with signed integer | 7 | 188,346,362 | 371,503,234 | 1.972 |
| tests/draft7/minItems.json :: minItems validation | 4 | 187,583,116 | 317,514,823 | 1.693 |
| tests/draft7/minLength.json :: minLength validation | 5 | 118,291,171 | 187,105,382 | 1.582 |
| tests/draft7/minProperties.json :: minProperties validation | 6 | 105,204,405 | 135,455,057 | 1.288 |
| tests/draft7/multipleOf.json :: by int | 3 | 116,173,937 | 176,080,140 | 1.516 |
| tests/draft7/multipleOf.json :: by number | 3 | 100,139,484 | 144,450,987 | 1.442 |
| tests/draft7/multipleOf.json :: by small number | 2 | 76,560,564 | 121,042,699 | 1.581 |
| tests/draft7/multipleOf.json :: invalid instance should not raise error when float division = inf | 1 | 14,539,120 | 15,869,422 | 1.091 |
| tests/draft7/not.json :: not | 2 | 86,619,508 | 234,289,420 | 2.705 |
| tests/draft7/not.json :: not multiple types | 3 | 83,577,580 | 287,242,687 | 3.437 |
| tests/draft7/not.json :: not more complex schema | 3 | 91,574,795 | 263,632,959 | 2.879 |
| tests/draft7/not.json :: forbidden property | 2 | 94,401,169 | 191,089,695 | 2.024 |
| tests/draft7/not.json :: not with boolean schema true | 1 | 63,086,805 | 137,509,749 | 2.180 |
| tests/draft7/not.json :: not with boolean schema false | 1 | 159,030,868 | 156,213,731 | 0.982 |
| tests/draft7/oneOf.json :: oneOf | 4 | 34,522,549 | 115,423,651 | 3.343 |
| tests/draft7/oneOf.json :: oneOf with base schema | 3 | 47,578,514 | 77,209,567 | 1.623 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all true | 1 | 53,079,379 | 136,837,472 | 2.578 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, one true | 1 | 30,037,554 | 154,368,908 | 5.139 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, more than one true | 1 | 54,262,881 | 132,301,316 | 2.438 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all false | 1 | 20,220,250 | 133,701,496 | 6.612 |
| tests/draft7/oneOf.json :: oneOf complex types | 4 | 38,379,990 | 134,676,665 | 3.509 |
| tests/draft7/oneOf.json :: oneOf with empty schema | 2 | 66,708,225 | 247,540,593 | 3.711 |
| tests/draft7/oneOf.json :: oneOf with required | 4 | 31,432,480 | 147,580,108 | 4.695 |
| tests/draft7/oneOf.json :: oneOf with missing optional property | 4 | 37,648,319 | 169,072,587 | 4.491 |
| tests/draft7/oneOf.json :: nested oneOf, to check validation semantics | 2 | 48,122,239 | 241,813,085 | 5.025 |
| tests/draft7/optional/bignum.json :: integer | 1 | 28,547,102 | 29,050,300 | 1.018 |
| tests/draft7/optional/bignum.json :: number | 1 | 131,057,804 | 129,040,204 | 0.985 |
| tests/draft7/optional/bignum.json :: integer | 1 | 28,329,137 | 28,956,157 | 1.022 |
| tests/draft7/optional/bignum.json :: number | 1 | 131,272,933 | 133,291,122 | 1.015 |
| tests/draft7/optional/bignum.json :: string | 1 | 64,768,146 | 133,601,121 | 2.063 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 124,896,750 | 118,421,589 | 0.948 |
| tests/draft7/optional/bignum.json :: float comparison with high precision | 1 | 56,945,400 | 114,892,858 | 2.018 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 125,508,438 | 118,476,266 | 0.944 |
| tests/draft7/optional/bignum.json :: float comparison with high precision on negative numbers | 1 | 58,791,160 | 114,686,060 | 1.951 |
| tests/draft7/optional/content.json :: validation of string-encoded content based on media type | 3 | 417,709,773 | 411,323,179 | 0.985 |
| tests/draft7/optional/content.json :: validation of binary string-encoding | 3 | 424,379,469 | 435,337,112 | 1.026 |
| tests/draft7/optional/content.json :: validation of binary-encoded media type documents | 4 | 536,663,903 | 551,872,249 | 1.028 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex $ does not match trailing newline | 2 | 53,870,011 | 61,225,595 | 1.137 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex converts \t to horizontal tab | 2 | 51,780,745 | 59,850,657 | 1.156 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and upper letter | 2 | 53,344,231 | 61,369,315 | 1.150 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and lower letter | 2 | 51,670,225 | 61,243,774 | 1.185 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \d matches ascii digits only | 3 | 53,188,023 | 67,231,644 | 1.264 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \D matches everything but ascii digits | 3 | 57,348,034 | 63,438,274 | 1.106 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \w matches ascii letters only | 2 | 54,217,743 | 63,741,850 | 1.176 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \W matches everything but ascii letters | 2 | 50,387,160 | 56,618,253 | 1.124 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \s matches whitespace | 11 | 62,968,636 | 66,753,377 | 1.060 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \S matches everything but whitespace | 11 | 51,216,965 | 72,340,309 | 1.412 |
| tests/draft7/optional/float-overflow.json :: all integers are multiples of 0.5, if overflow is handled | 1 | 14,115,052 | 15,232,044 | 1.079 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: pattern | 7 | 56,504,095 | 68,897,043 | 1.219 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: patternProperties | 5 | 13,861,980 | 46,793,939 | 3.376 |
| tests/draft7/pattern.json :: pattern validation | 8 | 167,791,895 | 178,833,811 | 1.066 |
| tests/draft7/pattern.json :: pattern is not anchored | 1 | 47,985,675 | 43,967,370 | 0.916 |
| tests/draft7/patternProperties.json :: patternProperties validates properties matching a regex | 7 | 23,193,324 | 60,343,100 | 2.602 |
| tests/draft7/patternProperties.json :: multiple simultaneous patternProperties are validated | 6 | 11,743,382 | 26,753,958 | 2.278 |
| tests/draft7/patternProperties.json :: regexes are not anchored by default and are case sensitive | 4 | 12,276,076 | 27,611,290 | 2.249 |
| tests/draft7/patternProperties.json :: patternProperties with boolean schemas | 5 | 14,248,759 | 51,428,635 | 3.609 |
| tests/draft7/properties.json :: object properties validation | 6 | 126,646,839 | 291,861,379 | 2.305 |
| tests/draft7/properties.json :: properties with boolean schema | 4 | 101,808,708 | 253,894,958 | 2.494 |
| tests/draft7/properties.json :: properties with escaped characters | 2 | 60,369,889 | 136,696,510 | 2.264 |
| tests/draft7/propertyNames.json :: propertyNames validation | 6 | 77,713,112 | 126,415,395 | 1.627 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema true | 2 | 294,177,695 | 289,878,848 | 0.985 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema false | 2 | 48,811,493 | 128,849,078 | 2.640 |
| tests/draft7/ref.json :: root pointer ref | 4 | 38,599,053 | 97,885,330 | 2.536 |
| tests/draft7/ref.json :: relative pointer ref to object | 2 | 89,919,347 | 181,698,705 | 2.021 |
| tests/draft7/ref.json :: relative pointer ref to array | 2 | 93,111,702 | 150,447,946 | 1.616 |
| tests/draft7/ref.json :: escaped pointer ref | 6 | 92,314,220 | 198,777,561 | 2.153 |
| tests/draft7/ref.json :: nested refs | 2 | 113,240,904 | 228,923,736 | 2.022 |
| tests/draft7/ref.json :: ref overrides any sibling keywords | 3 | 77,807,790 | 197,250,759 | 2.535 |
| tests/draft7/ref.json :: remote ref, containing refs itself | 2 | 5,864,127 | 85,938,538 | 14.655 |
| tests/draft7/ref.json :: property named $ref that is not a reference | 2 | 93,323,214 | 192,487,549 | 2.063 |
| tests/draft7/ref.json :: property named $ref, containing an actual $ref | 2 | 93,236,939 | 188,867,664 | 2.026 |
| tests/draft7/ref.json :: $ref to boolean schema true | 1 | 153,481,128 | 157,354,609 | 1.025 |
| tests/draft7/ref.json :: $ref to boolean schema false | 1 | 65,900,354 | 141,129,482 | 2.142 |
| tests/draft7/ref.json :: refs with quote | 2 | 94,143,798 | 189,233,726 | 2.010 |
| tests/draft7/ref.json :: naive replacement of $ref with its destination is not correct | 2 | 24,911,757 | 34,368,714 | 1.380 |
| tests/draft7/refRemote.json :: remote ref | 2 | 117,665,611 | 234,901,150 | 1.996 |
| tests/draft7/required.json :: required validation | 5 | 179,529,221 | 353,100,579 | 1.967 |
| tests/draft7/required.json :: required default validation | 1 | 157,174,910 | 152,081,746 | 0.968 |
| tests/draft7/required.json :: required with empty array | 1 | 153,453,587 | 152,350,303 | 0.993 |
| tests/draft7/required.json :: required with escaped characters | 2 | 72,085,968 | 162,822,153 | 2.259 |
| tests/draft7/type.json :: integer type matches integers | 9 | 90,428,808 | 220,675,256 | 2.440 |
| tests/draft7/type.json :: number type matches numbers | 9 | 120,436,774 | 386,969,583 | 3.213 |
| tests/draft7/type.json :: string type matches strings | 9 | 121,857,656 | 389,331,627 | 3.195 |
| tests/draft7/type.json :: object type matches objects | 7 | 92,865,361 | 361,164,199 | 3.889 |
| tests/draft7/type.json :: array type matches arrays | 7 | 94,699,738 | 375,311,965 | 3.963 |
| tests/draft7/type.json :: boolean type matches booleans | 10 | 103,549,990 | 388,854,938 | 3.755 |
| tests/draft7/type.json :: null type matches only the null object | 10 | 94,017,358 | 393,395,996 | 4.184 |
| tests/draft7/type.json :: multiple types can be specified in an array | 7 | 95,638,985 | 242,223,393 | 2.533 |
| tests/draft7/type.json :: type as array with one item | 2 | 125,813,753 | 252,845,092 | 2.010 |
| tests/draft7/type.json :: type: array or object | 5 | 122,222,054 | 338,678,316 | 2.771 |
| tests/draft7/type.json :: type: array, object or null | 5 | 165,611,293 | 348,150,405 | 2.102 |
| tests/draft7/uniqueItems.json :: uniqueItems validation | 23 | 16,037,792 | 25,317,566 | 1.579 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items | 8 | 32,578,984 | 53,462,772 | 1.641 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items and additionalItems=false | 5 | 45,453,714 | 99,542,308 | 2.190 |
| tests/draft7/uniqueItems.json :: uniqueItems=false validation | 15 | 1,278,361,947 | 748,383,429 | 0.585 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items | 8 | 272,295,072 | 307,876,620 | 1.131 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items and additionalItems=false | 5 | 193,559,393 | 257,420,019 | 1.330 |

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
