# ajv benchmark suite: replacement versus ajv

Measured 2026-10-23T00:38:15.679Z on Node.js 24.18.0.

## Environment

- Node.js: 24.18.0 (V8 13.6.233.17-node.50)
- Replacement: ajv 8.20.0 at commit 611e86a9ec741431ec7b7df0b43c41f01eba2814
- Benchmark suite: json-schema-benchmark at commit e9c884f9edd38438a150fef0e9a2a1173c0fcc50 (https://github.com/ebdrup/json-schema-benchmark)
- Cases: JSON-Schema-Test-Suite tests/draft7 and remotes at commit bcf1dc81ae099ade2a9642c672c06ee1af1bb489 (https://github.com/json-schema/JSON-Schema-Test-Suite)
- Machine: AMD Ryzen 9 5950X 16-Core Processor, 32 cores, x64, linux 7.0.0-38-generic, 94 GiB
- Procedure: Benchmark.js 2.1.4, Suite.run({async: false}), minTime 0s, maxTime 5s, minSamples 5; validate every document of the case per iteration

## Result

- Cases included: 193
- Documents verified: 695
- Verdict mismatches: 0
- Cases excluded (schema failed to compile): 52
- Aggregate: geometric mean of per-case throughput ratios (replacement / ajv) = **1.9801**
- Whole-suite throughput: ajv 17,238,303 documents/sec, replacement 36,641,818 documents/sec, ratio 2.126

## Per case

| Case | Documents | ajv (docs/sec) | Replacement (docs/sec) | Ratio |
|---|--:|--:|--:|--:|
| tests/draft7/additionalItems.json :: additionalItems as schema | 2 | 67,738,938 | 130,180,417 | 1.922 |
| tests/draft7/additionalItems.json :: array of items with no additionalItems | 5 | 218,940,018 | 342,623,201 | 1.565 |
| tests/draft7/additionalItems.json :: additionalItems are allowed by default | 1 | 109,169,281 | 112,882,361 | 1.034 |
| tests/draft7/additionalItems.json :: additionalItems should not look in applicators, invalid case | 1 | 40,131,767 | 88,121,776 | 2.196 |
| tests/draft7/additionalProperties.json :: additionalProperties being false does not allow other properties | 6 | 94,445,032 | 114,080,721 | 1.208 |
| tests/draft7/additionalProperties.json :: non-ASCII pattern with additionalProperties | 2 | 43,172,286 | 51,231,692 | 1.187 |
| tests/draft7/additionalProperties.json :: additionalProperties allows a schema which should validate | 3 | 26,897,742 | 109,289,074 | 4.063 |
| tests/draft7/additionalProperties.json :: additionalProperties can exist by itself | 2 | 19,547,667 | 105,863,235 | 5.416 |
| tests/draft7/additionalProperties.json :: additionalProperties are allowed by default | 1 | 135,950,492 | 135,926,098 | 1.000 |
| tests/draft7/additionalProperties.json :: additionalProperties should not look in applicators | 1 | 10,827,096 | 78,156,758 | 7.219 |
| tests/draft7/allOf.json :: allOf | 4 | 75,201,127 | 177,633,968 | 2.362 |
| tests/draft7/allOf.json :: allOf with base schema | 5 | 41,643,050 | 103,320,785 | 2.481 |
| tests/draft7/allOf.json :: allOf simple types | 2 | 96,304,625 | 184,463,499 | 1.915 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all true | 1 | 150,710,959 | 148,807,697 | 0.987 |
| tests/draft7/allOf.json :: allOf with boolean schemas, some false | 1 | 63,102,470 | 135,313,511 | 2.144 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all false | 1 | 62,607,953 | 132,954,757 | 2.124 |
| tests/draft7/allOf.json :: allOf with one empty schema | 1 | 147,286,317 | 143,206,976 | 0.972 |
| tests/draft7/allOf.json :: allOf with two empty schemas | 1 | 151,136,701 | 147,123,140 | 0.973 |
| tests/draft7/allOf.json :: allOf with the first empty schema | 2 | 113,930,786 | 226,666,471 | 1.990 |
| tests/draft7/allOf.json :: allOf with the last empty schema | 2 | 113,211,500 | 221,475,367 | 1.956 |
| tests/draft7/allOf.json :: nested allOf, to check validation semantics | 2 | 118,041,221 | 243,680,708 | 2.064 |
| tests/draft7/allOf.json :: allOf combined with anyOf, oneOf | 8 | 14,959,483 | 25,055,928 | 1.675 |
| tests/draft7/anyOf.json :: anyOf | 4 | 54,354,514 | 119,201,530 | 2.193 |
| tests/draft7/anyOf.json :: anyOf with base schema | 3 | 39,446,980 | 81,143,938 | 2.057 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all true | 1 | 156,667,886 | 156,658,337 | 1.000 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, some true | 1 | 159,606,182 | 146,984,488 | 0.921 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all false | 1 | 23,346,796 | 136,929,286 | 5.865 |
| tests/draft7/anyOf.json :: anyOf complex types | 4 | 49,523,395 | 195,993,906 | 3.958 |
| tests/draft7/anyOf.json :: anyOf with one empty schema | 2 | 300,366,941 | 265,913,784 | 0.885 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 47,040,127 | 252,861,823 | 5.375 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 47,565,666 | 264,697,354 | 5.565 |
| tests/draft7/boolean_schema.json :: boolean schema 'true' | 9 | 919,207,870 | 963,641,999 | 1.048 |
| tests/draft7/boolean_schema.json :: boolean schema 'false' | 9 | 75,739,019 | 514,187,560 | 6.789 |
| tests/draft7/const.json :: const validation | 3 | 104,156,121 | 227,587,011 | 2.185 |
| tests/draft7/const.json :: const with object | 4 | 20,743,498 | 27,726,122 | 1.337 |
| tests/draft7/const.json :: const with array | 3 | 24,131,516 | 36,404,639 | 1.509 |
| tests/draft7/const.json :: const with null | 2 | 119,071,314 | 258,277,245 | 2.169 |
| tests/draft7/const.json :: const with false does not match 0 | 3 | 108,110,569 | 341,753,940 | 3.161 |
| tests/draft7/const.json :: const with true does not match 1 | 3 | 111,935,874 | 349,759,555 | 3.125 |
| tests/draft7/const.json :: const with [false] does not match [0] | 3 | 41,991,015 | 61,415,528 | 1.463 |
| tests/draft7/const.json :: const with [true] does not match [1] | 3 | 40,173,418 | 60,568,420 | 1.508 |
| tests/draft7/const.json :: const with {"a": false} does not match {"a": 0} | 3 | 18,043,624 | 24,857,994 | 1.378 |
| tests/draft7/const.json :: const with {"a": true} does not match {"a": 1} | 3 | 17,808,914 | 25,339,599 | 1.423 |
| tests/draft7/const.json :: const with 0 does not match other zero-like types | 6 | 111,659,237 | 279,709,974 | 2.505 |
| tests/draft7/const.json :: const with 1 does not match true | 3 | 152,312,848 | 227,754,463 | 1.495 |
| tests/draft7/const.json :: const with -2.0 matches integer and float types | 5 | 125,902,565 | 374,225,470 | 2.972 |
| tests/draft7/const.json :: float and integers are equal up to 64-bit representation limits | 4 | 134,191,101 | 341,072,726 | 2.542 |
| tests/draft7/const.json :: nul characters in strings | 2 | 100,141,396 | 156,686,967 | 1.565 |
| tests/draft7/contains.json :: contains keyword validation | 6 | 29,971,800 | 256,421,957 | 8.555 |
| tests/draft7/contains.json :: contains keyword with const keyword | 3 | 21,166,704 | 217,931,721 | 10.296 |
| tests/draft7/contains.json :: contains keyword with boolean schema true | 2 | 109,609,472 | 205,534,118 | 1.875 |
| tests/draft7/contains.json :: contains keyword with boolean schema false | 3 | 71,354,161 | 230,380,537 | 3.229 |
| tests/draft7/contains.json :: items + contains | 4 | 13,198,415 | 18,022,347 | 1.365 |
| tests/draft7/default.json :: invalid type for default | 2 | 146,013,662 | 184,400,201 | 1.263 |
| tests/draft7/default.json :: invalid string value for default | 2 | 103,577,722 | 116,321,870 | 1.123 |
| tests/draft7/definitions.json :: valid definition | 1 | 1,894,520 | 43,455,996 | 22.938 |
| tests/draft7/definitions.json :: invalid definition | 1 | 1,924,902 | 33,040,892 | 17.165 |
| tests/draft7/dependencies.json :: dependencies | 7 | 182,901,109 | 342,730,356 | 1.874 |
| tests/draft7/dependencies.json :: dependencies with empty array | 3 | 413,644,440 | 403,873,960 | 0.976 |
| tests/draft7/dependencies.json :: multiple dependencies | 6 | 77,391,051 | 146,476,205 | 1.893 |
| tests/draft7/dependencies.json :: multiple dependencies subschema | 5 | 91,897,491 | 225,284,904 | 2.451 |
| tests/draft7/dependencies.json :: dependencies with boolean subschemas | 4 | 105,164,974 | 253,891,641 | 2.414 |
| tests/draft7/dependencies.json :: dependencies with escaped characters | 7 | 36,717,199 | 67,626,656 | 1.842 |
| tests/draft7/enum.json :: simple enum validation | 2 | 118,643,451 | 250,503,370 | 2.111 |
| tests/draft7/enum.json :: heterogeneous enum validation | 5 | 18,275,645 | 31,509,898 | 1.724 |
| tests/draft7/enum.json :: heterogeneous enum-with-null validation | 3 | 138,096,928 | 221,317,735 | 1.603 |
| tests/draft7/enum.json :: enums in properties | 6 | 87,840,830 | 217,831,959 | 2.480 |
| tests/draft7/enum.json :: enum with escaped characters | 3 | 157,138,049 | 296,648,926 | 1.888 |
| tests/draft7/enum.json :: enum with false does not match 0 | 3 | 110,372,640 | 336,814,529 | 3.052 |
| tests/draft7/enum.json :: enum with true does not match 1 | 3 | 107,026,371 | 340,284,512 | 3.179 |
| tests/draft7/enum.json :: enum with 0 does not match false | 3 | 152,086,545 | 238,247,505 | 1.567 |
| tests/draft7/enum.json :: enum with 1 does not match true | 3 | 148,740,254 | 232,247,332 | 1.561 |
| tests/draft7/enum.json :: nul characters in strings | 2 | 99,642,891 | 159,442,237 | 1.600 |
| tests/draft7/exclusiveMaximum.json :: exclusiveMaximum validation | 4 | 124,887,948 | 313,226,904 | 2.508 |
| tests/draft7/exclusiveMinimum.json :: exclusiveMinimum validation | 4 | 127,368,178 | 294,671,191 | 2.314 |
| tests/draft7/if-then-else.json :: if and then without else | 3 | 107,630,609 | 225,534,039 | 2.095 |
| tests/draft7/if-then-else.json :: if and else without then | 3 | 77,031,436 | 152,045,015 | 1.974 |
| tests/draft7/if-then-else.json :: validate against correct branch, then vs else | 4 | 56,853,064 | 169,039,154 | 2.973 |
| tests/draft7/if-then-else.json :: if with boolean schema true | 2 | 120,090,822 | 226,168,510 | 1.883 |
| tests/draft7/if-then-else.json :: if with boolean schema false | 2 | 117,037,173 | 240,212,071 | 2.052 |
| tests/draft7/if-then-else.json :: if appears at the end when serialized (keyword processing sequence) | 4 | 63,859,750 | 99,405,624 | 1.557 |
| tests/draft7/infinite-loop-detection.json :: evaluating the same schema location against the same data location twice is not a sign of an infinite loop | 2 | 73,985,480 | 115,536,249 | 1.562 |
| tests/draft7/items.json :: a schema given for items | 4 | 123,126,690 | 219,476,993 | 1.783 |
| tests/draft7/items.json :: an array of schemas for items | 6 | 195,344,129 | 267,295,699 | 1.368 |
| tests/draft7/items.json :: items with boolean schema (true) | 2 | 284,938,432 | 281,971,395 | 0.990 |
| tests/draft7/items.json :: items with boolean schema (false) | 2 | 82,251,683 | 191,638,161 | 2.330 |
| tests/draft7/items.json :: items with boolean schemas | 3 | 143,201,355 | 251,096,217 | 1.753 |
| tests/draft7/items.json :: items and subitems | 6 | 35,199,335 | 72,259,639 | 2.053 |
| tests/draft7/items.json :: nested items | 3 | 17,852,693 | 62,764,756 | 3.516 |
| tests/draft7/maximum.json :: maximum validation | 4 | 177,476,646 | 310,044,091 | 1.747 |
| tests/draft7/maximum.json :: maximum validation with unsigned integer | 4 | 169,230,906 | 286,280,403 | 1.692 |
| tests/draft7/maxItems.json :: maxItems validation | 4 | 190,008,751 | 316,970,299 | 1.668 |
| tests/draft7/maxLength.json :: maxLength validation | 5 | 146,670,795 | 181,025,934 | 1.234 |
| tests/draft7/maxProperties.json :: maxProperties validation | 6 | 128,018,544 | 178,523,699 | 1.395 |
| tests/draft7/maxProperties.json :: maxProperties = 0 means the object is empty | 2 | 67,801,070 | 103,716,556 | 1.530 |
| tests/draft7/minimum.json :: minimum validation | 4 | 179,716,353 | 307,088,435 | 1.709 |
| tests/draft7/minimum.json :: minimum validation with signed integer | 7 | 192,810,904 | 379,398,369 | 1.968 |
| tests/draft7/minItems.json :: minItems validation | 4 | 196,283,530 | 317,812,504 | 1.619 |
| tests/draft7/minLength.json :: minLength validation | 5 | 122,146,052 | 189,512,252 | 1.552 |
| tests/draft7/minProperties.json :: minProperties validation | 6 | 137,145,000 | 192,106,368 | 1.401 |
| tests/draft7/multipleOf.json :: by int | 3 | 115,008,446 | 169,156,355 | 1.471 |
| tests/draft7/multipleOf.json :: by number | 3 | 96,825,473 | 137,736,741 | 1.423 |
| tests/draft7/multipleOf.json :: by small number | 2 | 74,831,796 | 119,976,668 | 1.603 |
| tests/draft7/multipleOf.json :: invalid instance should not raise error when float division = inf | 1 | 14,414,418 | 15,882,228 | 1.102 |
| tests/draft7/not.json :: not | 2 | 84,723,771 | 233,022,636 | 2.750 |
| tests/draft7/not.json :: not multiple types | 3 | 82,475,316 | 283,683,080 | 3.440 |
| tests/draft7/not.json :: not more complex schema | 3 | 91,964,519 | 260,975,042 | 2.838 |
| tests/draft7/not.json :: forbidden property | 2 | 93,389,600 | 188,270,858 | 2.016 |
| tests/draft7/not.json :: not with boolean schema true | 1 | 61,499,512 | 138,311,351 | 2.249 |
| tests/draft7/not.json :: not with boolean schema false | 1 | 152,476,791 | 153,135,611 | 1.004 |
| tests/draft7/oneOf.json :: oneOf | 4 | 35,986,999 | 113,613,693 | 3.157 |
| tests/draft7/oneOf.json :: oneOf with base schema | 3 | 47,012,257 | 75,880,003 | 1.614 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all true | 1 | 55,217,864 | 135,605,886 | 2.456 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, one true | 1 | 30,639,069 | 152,839,399 | 4.988 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, more than one true | 1 | 55,857,558 | 135,696,229 | 2.429 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all false | 1 | 20,433,394 | 138,452,748 | 6.776 |
| tests/draft7/oneOf.json :: oneOf complex types | 4 | 38,865,981 | 135,311,554 | 3.481 |
| tests/draft7/oneOf.json :: oneOf with empty schema | 2 | 68,364,029 | 244,648,714 | 3.579 |
| tests/draft7/oneOf.json :: oneOf with required | 4 | 31,814,807 | 148,455,811 | 4.666 |
| tests/draft7/oneOf.json :: oneOf with missing optional property | 4 | 39,282,735 | 165,023,644 | 4.201 |
| tests/draft7/oneOf.json :: nested oneOf, to check validation semantics | 2 | 49,727,194 | 236,395,357 | 4.754 |
| tests/draft7/optional/bignum.json :: integer | 1 | 28,148,489 | 28,778,557 | 1.022 |
| tests/draft7/optional/bignum.json :: number | 1 | 130,330,091 | 125,758,758 | 0.965 |
| tests/draft7/optional/bignum.json :: integer | 1 | 28,150,015 | 29,765,457 | 1.057 |
| tests/draft7/optional/bignum.json :: number | 1 | 128,652,989 | 138,440,289 | 1.076 |
| tests/draft7/optional/bignum.json :: string | 1 | 66,471,042 | 130,538,593 | 1.964 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 124,269,904 | 118,033,334 | 0.950 |
| tests/draft7/optional/bignum.json :: float comparison with high precision | 1 | 58,931,691 | 114,218,725 | 1.938 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 121,001,965 | 113,098,657 | 0.935 |
| tests/draft7/optional/bignum.json :: float comparison with high precision on negative numbers | 1 | 55,291,893 | 109,991,963 | 1.989 |
| tests/draft7/optional/content.json :: validation of string-encoded content based on media type | 3 | 413,795,111 | 403,818,740 | 0.976 |
| tests/draft7/optional/content.json :: validation of binary string-encoding | 3 | 410,285,329 | 413,192,943 | 1.007 |
| tests/draft7/optional/content.json :: validation of binary-encoded media type documents | 4 | 535,408,609 | 519,517,113 | 0.970 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex $ does not match trailing newline | 2 | 53,346,353 | 61,127,780 | 1.146 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex converts \t to horizontal tab | 2 | 53,733,399 | 61,678,478 | 1.148 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and upper letter | 2 | 52,088,181 | 58,464,733 | 1.122 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and lower letter | 2 | 53,667,393 | 62,039,511 | 1.156 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \d matches ascii digits only | 3 | 52,870,688 | 67,115,419 | 1.269 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \D matches everything but ascii digits | 3 | 56,957,562 | 61,748,819 | 1.084 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \w matches ascii letters only | 2 | 55,185,476 | 62,245,903 | 1.128 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \W matches everything but ascii letters | 2 | 51,151,672 | 62,745,886 | 1.227 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \s matches whitespace | 11 | 65,377,296 | 65,460,401 | 1.001 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \S matches everything but whitespace | 11 | 50,718,734 | 74,633,843 | 1.472 |
| tests/draft7/optional/float-overflow.json :: all integers are multiples of 0.5, if overflow is handled | 1 | 14,329,794 | 15,830,454 | 1.105 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: pattern | 7 | 57,034,218 | 69,360,984 | 1.216 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: patternProperties | 5 | 13,729,732 | 46,813,986 | 3.410 |
| tests/draft7/pattern.json :: pattern validation | 8 | 163,603,612 | 168,579,886 | 1.030 |
| tests/draft7/pattern.json :: pattern is not anchored | 1 | 49,090,752 | 45,889,117 | 0.935 |
| tests/draft7/patternProperties.json :: patternProperties validates properties matching a regex | 7 | 22,272,205 | 58,593,544 | 2.631 |
| tests/draft7/patternProperties.json :: multiple simultaneous patternProperties are validated | 6 | 11,700,670 | 25,938,316 | 2.217 |
| tests/draft7/patternProperties.json :: regexes are not anchored by default and are case sensitive | 4 | 11,939,189 | 27,185,354 | 2.277 |
| tests/draft7/patternProperties.json :: patternProperties with boolean schemas | 5 | 13,388,446 | 49,558,114 | 3.702 |
| tests/draft7/properties.json :: object properties validation | 6 | 125,214,256 | 285,968,703 | 2.284 |
| tests/draft7/properties.json :: properties with boolean schema | 4 | 99,357,494 | 238,731,242 | 2.403 |
| tests/draft7/properties.json :: properties with escaped characters | 2 | 57,340,319 | 138,380,834 | 2.413 |
| tests/draft7/propertyNames.json :: propertyNames validation | 6 | 75,718,493 | 125,975,370 | 1.664 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema true | 2 | 290,812,275 | 289,615,560 | 0.996 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema false | 2 | 49,944,771 | 127,160,999 | 2.546 |
| tests/draft7/ref.json :: root pointer ref | 4 | 38,639,203 | 97,385,546 | 2.520 |
| tests/draft7/ref.json :: relative pointer ref to object | 2 | 90,164,264 | 178,989,806 | 1.985 |
| tests/draft7/ref.json :: relative pointer ref to array | 2 | 92,233,025 | 151,774,031 | 1.646 |
| tests/draft7/ref.json :: escaped pointer ref | 6 | 92,618,778 | 199,535,736 | 2.154 |
| tests/draft7/ref.json :: nested refs | 2 | 116,487,028 | 232,697,626 | 1.998 |
| tests/draft7/ref.json :: ref overrides any sibling keywords | 3 | 85,410,536 | 198,374,227 | 2.323 |
| tests/draft7/ref.json :: remote ref, containing refs itself | 2 | 6,288,007 | 86,737,227 | 13.794 |
| tests/draft7/ref.json :: property named $ref that is not a reference | 2 | 93,142,573 | 184,846,161 | 1.985 |
| tests/draft7/ref.json :: property named $ref, containing an actual $ref | 2 | 92,451,808 | 191,027,244 | 2.066 |
| tests/draft7/ref.json :: $ref to boolean schema true | 1 | 150,709,778 | 154,102,347 | 1.023 |
| tests/draft7/ref.json :: $ref to boolean schema false | 1 | 63,776,238 | 130,682,521 | 2.049 |
| tests/draft7/ref.json :: refs with quote | 2 | 94,362,184 | 180,238,160 | 1.910 |
| tests/draft7/ref.json :: naive replacement of $ref with its destination is not correct | 2 | 25,481,919 | 36,578,103 | 1.435 |
| tests/draft7/refRemote.json :: remote ref | 2 | 111,133,249 | 216,076,928 | 1.944 |
| tests/draft7/required.json :: required validation | 5 | 178,845,767 | 340,969,995 | 1.907 |
| tests/draft7/required.json :: required default validation | 1 | 149,566,385 | 147,145,944 | 0.984 |
| tests/draft7/required.json :: required with empty array | 1 | 152,981,364 | 151,161,413 | 0.988 |
| tests/draft7/required.json :: required with escaped characters | 2 | 70,110,052 | 159,335,299 | 2.273 |
| tests/draft7/type.json :: integer type matches integers | 9 | 90,367,496 | 214,690,317 | 2.376 |
| tests/draft7/type.json :: number type matches numbers | 9 | 116,852,061 | 379,804,988 | 3.250 |
| tests/draft7/type.json :: string type matches strings | 9 | 120,084,170 | 383,285,110 | 3.192 |
| tests/draft7/type.json :: object type matches objects | 7 | 89,500,987 | 357,917,931 | 3.999 |
| tests/draft7/type.json :: array type matches arrays | 7 | 97,326,354 | 376,353,035 | 3.867 |
| tests/draft7/type.json :: boolean type matches booleans | 10 | 102,842,424 | 384,602,505 | 3.740 |
| tests/draft7/type.json :: null type matches only the null object | 10 | 91,525,776 | 391,420,860 | 4.277 |
| tests/draft7/type.json :: multiple types can be specified in an array | 7 | 93,889,345 | 241,386,009 | 2.571 |
| tests/draft7/type.json :: type as array with one item | 2 | 120,165,694 | 247,893,127 | 2.063 |
| tests/draft7/type.json :: type: array or object | 5 | 119,645,774 | 328,885,834 | 2.749 |
| tests/draft7/type.json :: type: array, object or null | 5 | 161,120,004 | 340,864,752 | 2.116 |
| tests/draft7/uniqueItems.json :: uniqueItems validation | 23 | 15,684,856 | 25,225,925 | 1.608 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items | 8 | 33,216,383 | 55,234,912 | 1.663 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items and additionalItems=false | 5 | 46,841,589 | 97,865,082 | 2.089 |
| tests/draft7/uniqueItems.json :: uniqueItems=false validation | 15 | 1,217,360,227 | 772,914,861 | 0.635 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items | 8 | 285,815,586 | 303,212,307 | 1.061 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items and additionalItems=false | 5 | 182,061,081 | 248,432,593 | 1.365 |

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
